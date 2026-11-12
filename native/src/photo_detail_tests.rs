//! Quantitative synthetic checks; these do not certify portrait/real-camera quality.
use super::*;
use lightcraft_color::luminance_2020;
use lightcraft_pipeline::{
    local::{apply_nr_v2, denoise, log_lum, nr_params},
    photo_detail,
};
use lightcraft_raster::{Plane, blur::gaussian};
fn noise(x: usize, y: usize) -> f32 {
    let mut s = (x as u32).wrapping_mul(747796405) ^ (y as u32).wrapping_mul(2891336453);
    s = (s ^ (s >> 16)).wrapping_mul(2246822519);
    (s & 65535) as f32 / 65535. - 0.5
}
fn settings() -> DevelopSettings {
    let mut s = DevelopSettings::default();
    s.detail.process_version = 2;
    s
}
#[test]
fn flat_fields_and_empty_planes_do_not_create_sharpness() {
    for value in [-18., -2., 0., 3.] {
        let a = Plane::filled(64, 48, value);
        let b = photo_detail::sharpen_band(&a, 2., 0.);
        assert!(b.data.iter().all(|v| v.abs() < 1e-5));
    }
    let b = photo_detail::sharpen_band(&Plane::new(0, 0), 1., 0.);
    assert!(b.data.is_empty());
}
#[test]
fn sharpening_is_nontrivial_but_stays_inside_neighbor_envelope() {
    let src = Plane::from_fn(128, 64, |x, _| {
        if x < 45 {
            -3.
        } else if x > 80 {
            1.
        } else {
            -3. + 4. * ((x - 45) as f32 / 35.).powi(2)
        }
    });
    let band = photo_detail::sharpen_band(&src, 2.5, 0.);
    assert!(band.data.iter().map(|v| v.abs()).sum::<f32>() > 0.001);
    for i in 0..src.data.len() {
        let out = src.data[i] + 1.3 * band.data[i];
        assert!((-3. - 1e-5..=1. + 1e-5).contains(&out));
    }
    let step = Plane::from_fn(128, 64, |x, _| if x < 64 { -4. } else { 1. });
    let b = photo_detail::sharpen_band(&step, 3., 0.);
    for (i, v) in step.data.iter().enumerate() {
        let out = *v + 1.3 * b.data[i];
        assert!((-4. - 1e-5..=1. + 1e-5).contains(&out));
    }
}
#[test]
fn fine_noise_is_boosted_less_than_the_previous_highpass() {
    let l = Plane::from_fn(192, 96, |x, y| -2. + noise(x, y) * 0.3);
    let old = gaussian(&l, 1.5);
    let b = photo_detail::sharpen_band(&l, 1.5, 0.);
    let var = |values: Vec<f32>| {
        let mean = values.iter().sum::<f32>() / values.len() as f32;
        values.iter().map(|v| (v - mean).powi(2)).sum::<f32>() / values.len() as f32
    };
    let before = var(l.data.clone());
    let legacy = var(l
        .data
        .iter()
        .zip(&old.data)
        .map(|(x, y)| x + 0.8 * (x - y))
        .collect());
    let improved = var(l
        .data
        .iter()
        .zip(&b.data)
        .map(|(x, y)| x + 0.8 * y)
        .collect());
    eprintln!("noise variance: original={before}, previous={legacy}, protected={improved}");
    assert!(improved < legacy * 0.8);
    assert!(improved >= before * 0.95);
    let masked = photo_detail::sharpen_band(&l, 1.5, 0.8);
    assert!(
        masked.data.iter().map(|x| x * x).sum::<f32>() < b.data.iter().map(|x| x * x).sum::<f32>()
    );
}
#[test]
fn color_noise_is_reduced_and_luminance_is_preserved() {
    let src = Rgb32f::from_fn(160, 96, |x, y| {
        let n = noise(x, y) * 0.08;
        let m = noise(x + 193, y + 31) * 0.08;
        let r = 0.2 + n;
        let b = 0.2 + m;
        let g = (0.2 - 0.2627 * r - 0.0593 * b) / 0.678;
        [r, g, b]
    });
    let mut s = settings();
    s.detail.nr_color = 80.;
    let (_, nr) = nr_params(&s, 1.);
    let mut previous = src.clone();
    apply_nr_v2(&mut previous, None, nr);
    let mut got = src.clone();
    denoise(&mut got, &s, 1.);
    let mse = |im: &Rgb32f| {
        im.data
            .iter()
            .flat_map(|p| p.iter())
            .map(|c| (*c - 0.2).powi(2))
            .sum::<f32>()
            / (im.data.len() * 3) as f32
    };
    eprintln!(
        "chroma MSE: original={}, previous={}, refined={}",
        mse(&src),
        mse(&previous),
        mse(&got)
    );
    assert!(mse(&got) < mse(&src) * 0.85);
    assert!(mse(&got) <= mse(&previous) * 1.05);
    for (p, q) in src.data.iter().zip(&got.data) {
        assert!((luminance_2020(*p) - luminance_2020(*q)).abs() < 2e-6);
    }
}
#[test]
fn refinement_does_not_bleed_across_a_strong_color_edge() {
    let left = [0.7, 0.08, 0.06];
    let right = [0.03, 0.25, 0.8];
    let src = Rgb32f::from_fn(128, 64, |x, _| if x < 64 { left } else { right });
    let mut s = settings();
    s.detail.nr_color = 100.;
    let mut got = src.clone();
    denoise(&mut got, &s, 1.);
    for y in 4..60 {
        for x in 60..68 {
            let i = y * 128 + x;
            for c in 0..3 {
                assert!((got.data[i][c] - src.data[i][c]).abs() < 0.004);
            }
        }
    }
}
#[test]
fn amount_zero_keeps_approved_tones_and_video_uses_previous_detail() {
    let pixels = Arc::new(Rgb32f::from_fn(96, 64, |x, y| {
        [0.1 + x as f32 / 140., 0.2 + noise(x, y) * 0.03, 0.3]
    }));
    let settings = Settings {
        shadows: 40.,
        highlights: -35.,
        denoise: 0.,
        denoise_color: Some(0.),
        ..Default::default()
    };
    let info = SourceInfo::default();
    let mut dev = settings.develop(&info);
    let req = RenderRequest::fit(96, 64);
    let a = lightcraft_pipeline::render(&pixels, &info, &dev, &req);
    dev.detail.sharpen_radius = 3.;
    dev.detail.sharpen_masking = 80.;
    let b = lightcraft_pipeline::render(&pixels, &info, &dev, &req);
    assert_eq!(a.image.data, b.image.data);
    dev.detail.process_version = 1;
    dev.detail.nr_luminance = 55.;
    dev.detail.nr_color = 45.;
    let mut video = (*pixels).clone();
    denoise(&mut video, &dev, 1.);
    let mut reference = (*pixels).clone();
    let (l, c) = nr_params(&dev, 1.);
    lightcraft_pipeline::local::apply_nr(&mut reference, l, c);
    assert_eq!(video.data, reference.data);
}
#[test]
fn full_float_preview_and_export_keep_matching_detail() {
    let pixels = Arc::new(Rgb32f::from_fn(192, 128, |x, y| {
        let l = 0.15 + 0.6 * (x as f32 / 192.).powi(2) + noise(x, y) * 0.03;
        [l, l * 0.9, l * 0.8]
    }));
    let s = Settings {
        sharpness: 85.,
        sharpen_radius: 1.7,
        sharpen_masking: 35.,
        denoise: 35.,
        denoise_color: Some(45.),
        ..Default::default()
    };
    let info = SourceInfo::default();
    let preview = render(
        &pixels,
        &info,
        &StageCache::default(),
        &s,
        192,
        OutputDepth::F32Linear,
    );
    let export = render_export(&pixels, &info, &StageCache::default(), &s, 192).unwrap();
    assert_eq!(preview.deep.unwrap().samples, export.samples);
}
#[test]
fn cached_mask_radius_and_zero_amount_changes_do_not_reuse_a_stale_band() {
    let pixels = Arc::new(Rgb32f::from_fn(192, 128, |x, y| {
        let l = 0.2 + 0.08 * (x as f32 / 3.).sin() + noise(x, y) * 0.025;
        [l, l * 0.8, l * 0.7]
    }));
    let info = SourceInfo::default();
    let cache = StageCache::default();
    for (radius, mask, amount) in [
        (0., 0., 80.),
        (2.5, 0., 80.),
        (2.5, 80., 80.),
        (0., 0., 0.),
        (0., 0., 80.),
    ] {
        let s = Settings {
            sharpness: amount,
            sharpen_radius: radius,
            sharpen_masking: mask,
            denoise_color: Some(0.),
            ..Default::default()
        };
        let a = render(&pixels, &info, &cache, &s, 192, OutputDepth::F32Linear);
        let b = render(
            &pixels,
            &info,
            &StageCache::default(),
            &s,
            192,
            OutputDepth::F32Linear,
        );
        assert_eq!(a.deep.unwrap().samples, b.deep.unwrap().samples);
    }
}
#[test]
fn narrow_images_and_signed_wide_gamut_values_stay_finite() {
    for (w, h) in [(1, 1), (1, 32), (32, 1)] {
        let mut img = Rgb32f::from_fn(w, h, |x, y| [-0.02, 0.2 + noise(x, y) * 0.01, 1.1]);
        let s = {
            let mut s = settings();
            s.detail.nr_color = 100.;
            s
        };
        denoise(&mut img, &s, 1.);
        assert!(img.data.iter().flatten().all(|v| v.is_finite()));
        let l = img.map(log_lum);
        let b = photo_detail::sharpen_band(&l, 3., 0.);
        assert!(b.data.iter().all(|v| v.is_finite()));
    }
}
#[test]
#[ignore = "local CPU microbenchmark, not a portable CI timing gate"]
fn compare_color_refinement_cpu_cost() {
    let src = Rgb32f::from_fn(1600, 1000, |x, y| {
        let n = noise(x, y) * 0.02;
        [0.3 + n, 0.2 - n, 0.1 + n]
    });
    let mut s = settings();
    s.detail.nr_color = 50.;
    let (_, nr) = nr_params(&s, 1.);
    for label in ["previous", "refined"] {
        let mut times = vec![];
        for _ in 0..5 {
            let mut image = src.clone();
            let start = Instant::now();
            if label == "previous" {
                apply_nr_v2(&mut image, None, nr);
            } else {
                denoise(&mut image, &s, 1.);
            }
            times.push(start.elapsed().as_secs_f64() * 1000.);
        }
        times.sort_by(|a, b| a.total_cmp(b));
        eprintln!("{label} chroma 1.6 MP median ms: {:.2}", times[2]);
    }
}
#[test]
fn native_window_matches_full_frame_detail_away_from_its_boundary() {
    let pixels = Arc::new(Rgb32f::from_fn(512, 320, |x, y| {
        let l = 0.2 + 0.15 * (x as f32 / 9.).sin() + noise(x, y) * 0.02;
        [l, l * 0.85, l * 0.75]
    }));
    let info = SourceInfo::default();
    let s = Settings {
        sharpness: 80.,
        sharpen_radius: 2.,
        sharpen_masking: 25.,
        denoise_color: Some(40.),
        ..Default::default()
    }
    .develop(&info);
    let req = RenderRequest::fit(512, 320);
    let full = lightcraft_pipeline::render(&pixels, &info, &s, &req).image;
    let mut req = req;
    req.window = Some(lightcraft_pipeline::PixelWindow {
        x: 64,
        y: 64,
        w: 384,
        h: 192,
    });
    let region = lightcraft_pipeline::render(&pixels, &info, &s, &req).image;
    let mut worst = 0;
    for y in 96..224 {
        for x in 96..416 {
            for c in 0..3 {
                let a = full.data[y * 512 + x][c];
                let b = region.data[(y - 64) * 384 + x - 64][c];
                worst = worst.max(a.abs_diff(b));
            }
        }
    }
    assert!(worst <= 1, "window differs by {worst} code values");
}
#[test]
fn positive_mask_sharpening_uses_the_protected_path_and_hiding_restores_original() {
    let pixels = Arc::new(Rgb32f::from_fn(160, 96, |x, y| {
        let l = 0.3 + 0.06 * (x as f32 / 3.).sin() + noise(x, y) * 0.01;
        [l, l, l]
    }));
    let mask:lightcraft_develop::Mask=serde_json::from_value(json!({"id":1,"name":"Detalle local","visible":true,"invert":false,"components":[{"op":"add","invert":false,"shape":{"kind":"radial","center":{"x":0.5,"y":0.5},"rx":0.4,"ry":0.3,"angle":0.,"feather":50.,"invert":false}}],"adjust":{"sharpness":80.}})).unwrap();
    let mut s = Settings {
        masks: vec![mask],
        denoise_color: Some(0.),
        ..Default::default()
    };
    let info = SourceInfo::default();
    let cache = StageCache::default();
    let active = render(&pixels, &info, &cache, &s, 160, OutputDepth::F32Linear);
    s.masks[0].visible = false;
    let hidden = render(&pixels, &info, &cache, &s, 160, OutputDepth::F32Linear);
    let original = render(
        &pixels,
        &info,
        &StageCache::default(),
        &Settings {
            denoise_color: Some(0.),
            ..Default::default()
        },
        160,
        OutputDepth::F32Linear,
    );
    assert_eq!(hidden.image.data, original.image.data);
    assert_ne!(active.image.data, hidden.image.data);
}
