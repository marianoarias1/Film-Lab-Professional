//! Deterministic invariants for the first V2 block. Photos are reviewed separately.
use super::*;
use lightcraft_color::luminance_2020;
use lightcraft_pipeline::local::{apply_nr, denoise, nr_params};

fn image(w: usize, h: usize, f: impl Fn(usize, usize) -> [f32; 3]) -> Rgb32f {
    let mut out = Rgb32f::new(w, h);
    for y in 0..h {
        for x in 0..w {
            out.data[y * w + x] = f(x, y);
        }
    }
    out
}
fn noise(x: usize, y: usize) -> f32 {
    let mut n = (x as u32).wrapping_mul(747796405) ^ (y as u32).wrapping_mul(2891336453);
    n = (n ^ (n >> 16)).wrapping_mul(2246822519);
    (n & 65535) as f32 / 65535.0 - 0.5
}
fn dev(version: u8, lum: f64, col: f64) -> DevelopSettings {
    Settings {
        process_version: version,
        denoise: lum,
        denoise_color: Some(col),
        ..Default::default()
    }
    .develop(&SourceInfo::default())
}

#[test]
fn old_settings_are_v1_and_unknown_versions_are_rejected() {
    let old: Settings = serde_json::from_value(json!({"denoise":50})).unwrap();
    assert_eq!(old.process_version, 1);
    assert!(old.validate().is_ok());
    for version in [0, 3, 255] {
        assert!(
            Settings {
                process_version: version,
                ..Default::default()
            }
            .validate()
            .is_err()
        );
    }
}
#[test]
fn v1_is_exactly_the_legacy_algorithm() {
    let src = image(64, 48, |x, y| [0.2 + noise(x, y) * 0.1, 0.3, 0.4]);
    let mut got = src.clone();
    let mut expected = src;
    let s = dev(1, 65., 50.);
    denoise(&mut got, &s, 1.);
    let (l, c) = nr_params(&s, 1.);
    apply_nr(&mut expected, l, c);
    assert_eq!(got.data, expected.data);
}
#[test]
fn disabled_nr_and_zero_scale_are_identity() {
    let src = image(32, 24, |x, y| [noise(x, y), 0.2, 1.2]);
    for (s, scale) in [(dev(2, 0., 0.), 1.), (dev(2, 80., 80.), 0.)] {
        let mut got = src.clone();
        denoise(&mut got, &s, scale);
        assert_eq!(got.data, src.data);
    }
}
#[test]
fn v2_preserves_constant_neutrals_and_wide_gamut() {
    for p in [[0.; 3], [0.18; 3], [1.5; 3], [-0.03, 0.25, 0.5]] {
        let mut got = image(40, 32, |_, _| p);
        denoise(&mut got, &dev(2, 70., 80.), 1.);
        for out in got.data {
            for c in 0..3 {
                assert!((out[c] - p[c]).abs() < 2e-4, "{p:?} -> {out:?}");
            }
        }
    }
}
#[test]
fn v2_reduces_luminance_noise_without_destroying_a_step() {
    let src = image(128, 64, |x, y| {
        let base = if x < 64 { 0.12 } else { 0.65 };
        [base + noise(x, y) * 0.04; 3]
    });
    let mut got = src.clone();
    denoise(&mut got, &dev(2, 80., 0.), 1.);
    let mse = |im: &Rgb32f| {
        let mut sum = 0.;
        let mut n = 0;
        for y in 8..56 {
            for x in (8..55).chain(73..120) {
                let base = if x < 64 { 0.12 } else { 0.65 };
                sum += (im.data[y * 128 + x][0] - base).powi(2);
                n += 1;
            }
        }
        sum / n as f32
    };
    assert!(
        mse(&got) < mse(&src) * 0.8,
        "{} -> {}",
        mse(&src),
        mse(&got)
    );
    for y in 8..56 {
        assert!(got.data[y * 128 + 64][0] - got.data[y * 128 + 63][0] > 0.4);
    }
}
#[test]
fn chroma_reduction_keeps_luminance_and_bleeds_less_than_v1() {
    let left = [0.8, 0.12, 0.12];
    let right = [0.12, 0.12 + (0.8 - 0.12) * 0.2627 / 0.6780, 0.12];
    let src = image(96, 48, |x, _| if x < 48 { left } else { right });
    let mut old = src.clone();
    let mut new = src.clone();
    denoise(&mut old, &dev(1, 0., 100.), 1.);
    denoise(&mut new, &dev(2, 0., 100.), 1.);
    let mut old_error = 0.;
    let mut new_error = 0.;
    for y in 8..40 {
        for x in 45..51 {
            let i = y * 96 + x;
            assert!((luminance_2020(new.data[i]) - luminance_2020(src.data[i])).abs() < 1e-5);
            for c in 0..3 {
                old_error += (old.data[i][c] - src.data[i][c]).abs();
                new_error += (new.data[i][c] - src.data[i][c]).abs();
            }
        }
    }
    assert!(
        new_error < old_error * 0.2,
        "bleed {old_error} -> {new_error}"
    );
}
#[test]
fn chroma_noise_is_reduced_in_flat_regions() {
    let src = image(64, 48, |x, y| {
        let n = noise(x, y) * 0.045;
        [0.2 + n, 0.2 - n * 0.2627 / 0.6780, 0.2]
    });
    let mut got = src.clone();
    denoise(&mut got, &dev(2, 0., 100.), 1.);
    let error = |im: &Rgb32f| im.data.iter().map(|p| (p[0] - 0.2).powi(2)).sum::<f32>();
    assert!(
        error(&got) < error(&src) * 0.85,
        "{} -> {}",
        error(&src),
        error(&got)
    );
}
#[test]
fn process_switch_does_not_reuse_another_process_cache() {
    let pixels = Arc::new(image(96, 64, |x, y| [0.2 + noise(x, y) * 0.04, 0.22, 0.18]));
    let cache = StageCache::default();
    let info = SourceInfo::default();
    let mut s = Settings {
        denoise: 70.,
        denoise_color: Some(60.),
        ..Default::default()
    };
    for draft in [false, true] {
        let a = render_quality(
            &pixels,
            &info,
            &cache,
            &s,
            96,
            OutputDepth::F32Linear,
            draft,
        )
        .image
        .data;
        s.process_version = 2;
        let b = render_quality(
            &pixels,
            &info,
            &cache,
            &s,
            96,
            OutputDepth::F32Linear,
            draft,
        )
        .image
        .data;
        let fresh = render_quality(
            &pixels,
            &info,
            &StageCache::default(),
            &s,
            96,
            OutputDepth::F32Linear,
            draft,
        )
        .image
        .data;
        assert_eq!(b, fresh);
        assert_ne!(a, b);
        s.process_version = 1;
        let again = render_quality(
            &pixels,
            &info,
            &cache,
            &s,
            96,
            OutputDepth::F32Linear,
            draft,
        )
        .image
        .data;
        assert_eq!(a, again);
    }
}

#[test]
fn full_precision_preview_and_export_share_the_same_v2_pixels() {
    let pixels = Arc::new(image(96, 64, |x, y| [0.2 + noise(x, y) * 0.05, 0.25, 0.18]));
    let info = SourceInfo::default();
    let s = Settings {
        process_version: 2,
        denoise: 65.,
        denoise_color: Some(80.),
        sharpness: 35.,
        ..Default::default()
    };
    let r = render(
        &pixels,
        &info,
        &StageCache::default(),
        &s,
        96,
        OutputDepth::F32Linear,
    );
    let exported = render_export(&pixels, &info, &StageCache::default(), &s, 96).unwrap();
    match (&r.deep.unwrap().samples, &exported.samples) {
        (DeepSamples::F32(preview), DeepSamples::F32(export)) => assert_eq!(preview, export),
        _ => panic!("Both paths must retain float32 samples"),
    }
}
