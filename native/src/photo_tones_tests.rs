use lightcraft_color::perceptual::{oklab_from_2020, oklab_to_2020};
use lightcraft_color::{REC2020, SRGB};
use lightcraft_pipeline::finish::{gamut_map, photo_gamut_srgb, photo_tone_delta};

#[test]
fn extreme_shadow_highlight_combinations_keep_ramps_monotone() {
    for h in [-1.0, -0.5, 0.0, 0.5, 1.0] {
        for s in [-1.0, -0.5, 0.0, 0.5, 1.0] {
            let mut last = f32::NEG_INFINITY;
            for i in 0..24001 {
                let base = -16.0 + i as f32 * 0.001;
                let v = base + photo_tone_delta(base, h, s);
                assert!(
                    v.is_finite() && v > last,
                    "h={h},s={s},base={base}: {last} -> {v}"
                );
                last = v;
            }
        }
    }
}
#[test]
fn tonal_controls_are_neutral_when_disabled_and_have_expected_directions() {
    for base in [-20., -10., -5., 0., 3., 8., 20.] {
        assert_eq!(photo_tone_delta(base, 0., 0.), 0.);
    }
    assert!(photo_tone_delta(3., -1., 0.) < 0.);
    assert!(photo_tone_delta(-5., 0., 1.) > 0.);
    assert!(photo_tone_delta(-5., -1., 0.).abs() < photo_tone_delta(3., -1., 0.).abs());
    assert!(photo_tone_delta(3., 0., 1.).abs() < photo_tone_delta(-5., 0., 1.).abs());
}
#[test]
fn representable_rgb_is_untouched_including_neutrals_and_white() {
    for r in 0..=10 {
        for g in 0..=10 {
            for b in 0..=10 {
                let rgb = [r as f32 / 10., g as f32 / 10., b as f32 / 10.];
                assert_eq!(photo_gamut_srgb(rgb), (rgb, 1.));
            }
        }
    }
}
#[test]
fn gamut_projection_preserves_perceptual_hue_and_lightness() {
    let to_srgb = REC2020.to_space(&SRGB);
    let to_work = SRGB.to_space(&REC2020);
    let mut projected = 0;
    for l in [0.3, 0.5, 0.7, 0.85] {
        for degree in (0..360).step_by(15) {
            let hue = (degree as f32).to_radians();
            let lab = [l, 0.3 * hue.cos(), 0.3 * hue.sin()];
            let rgb = to_srgb.apply_f32(oklab_to_2020(lab));
            let (out, t) = photo_gamut_srgb(rgb);
            assert!(out.iter().all(|c| c.is_finite() && (0.0..=1.0).contains(c)));
            if t < 0.999 && t > 0.001 {
                projected += 1;
                let got = oklab_from_2020(to_work.apply_f32(out));
                assert!((got[0] - l).abs() < 2e-4);
                let dh = (got[2].atan2(got[1]) - hue).sin().abs();
                assert!(dh < 0.002, "hue={degree}, L={l}, error={dh}");
            }
        }
    }
    assert!(projected > 30);
}
#[test]
fn hue_projection_improves_on_linear_rgb_desaturation_for_synthetic_colors() {
    let to_srgb = REC2020.to_space(&SRGB);
    let to_work = SRGB.to_space(&REC2020);
    let mut old_error = 0.;
    let mut new_error = 0.;
    for degree in (0..360).step_by(15) {
        let h = (degree as f32).to_radians();
        let lab = [0.7, 0.3 * h.cos(), 0.3 * h.sin()];
        let rgb = to_srgb.apply_f32(oklab_to_2020(lab));
        let (old, _) = gamut_map(rgb, [0.2126, 0.7152, 0.0722]);
        let (new, t) = photo_gamut_srgb(rgb);
        if t >= 0.999 {
            continue;
        }
        let a = oklab_from_2020(to_work.apply_f32(old));
        let b = oklab_from_2020(to_work.apply_f32(new));
        old_error += (a[2].atan2(a[1]) - h).sin().abs();
        new_error += (b[2].atan2(b[1]) - h).sin().abs();
    }
    assert!(new_error < old_error * 0.1, "{old_error} vs {new_error}");
}
#[test]
fn gamut_boundary_is_continuous_and_never_produces_nonfinite_values() {
    let a = photo_gamut_srgb([1.0, 0.2, 0.1]).0;
    let b = photo_gamut_srgb([1.000001, 0.2, 0.1]).0;
    assert!(a.iter().zip(b).all(|(x, y)| (x - y).abs() < 0.001));
    for rgb in [
        [-0.01, 0.2, 0.5],
        [2., 0.1, 0.2],
        [10.; 3],
        [-1.; 3],
        [f32::INFINITY, 0., 0.],
    ] {
        assert!(
            photo_gamut_srgb(rgb)
                .0
                .iter()
                .all(|c| c.is_finite() && (0.0..=1.0).contains(c))
        );
    }
}

#[test]
fn full_pipeline_grayscale_ramps_remain_monotone_with_extreme_controls() {
    use super::*;
    let pixels = Arc::new(Rgb32f::from_fn(512, 24, |x, _| {
        [0.18 * 2f32.powf(-10. + 12. * x as f32 / 511.); 3]
    }));
    for h in [-100., 0., 100.] {
        for sh in [-100., 0., 100.] {
            let s = Settings {
                highlights: h,
                shadows: sh,
                denoise_color: Some(0.),
                ..Default::default()
            };
            let out = render_export(
                &pixels,
                &SourceInfo::default(),
                &StageCache::default(),
                &s,
                512,
            )
            .unwrap();
            if let DeepSamples::F32(v) = out.samples {
                for x in 1..512 {
                    let last = v[(12 * 512 + x - 1) * 3];
                    let next = v[(12 * 512 + x) * 3];
                    assert!(next + 1e-5 >= last, "h={h} sh={sh} x={x}: {last} -> {next}");
                }
            } else {
                panic!("Expected float32");
            }
        }
    }
}
#[test]
fn full_pipeline_maps_saturated_color_without_changing_its_oklab_hue() {
    use super::*;
    let rgb = [0.8, 0.025, 0.015];
    let lab = oklab_from_2020(rgb);
    let pixels = Arc::new(Rgb32f::filled(32, 24, rgb));
    let settings = Settings {
        contrast: 30.,
        denoise_color: Some(0.),
        ..Default::default()
    };
    let out = render_export(
        &pixels,
        &SourceInfo::default(),
        &StageCache::default(),
        &settings,
        32,
    )
    .unwrap();
    if let DeepSamples::F32(v) = out.samples {
        let p = [v[0], v[1], v[2]];
        let got = oklab_from_2020(SRGB.to_space(&REC2020).apply_f32(p));
        let dh = (got[2].atan2(got[1]) - lab[2].atan2(lab[1])).sin().abs();
        assert!(dh < 0.005, "Hue error {dh}");
    } else {
        panic!("Expected float32");
    }
}
