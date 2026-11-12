//! Highlight bloom in output-linear RGB. Bounded working grid, deterministic for video.
use lightcraft_pipeline::{DeepImage, DeepSamples, geometry::Frame};
use lightcraft_raster::{Plane, Rgb32f, blur::gaussian};
use serde::{Deserialize, Serialize};
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Glow {
    pub enabled: bool,
    pub style: String,
    pub amount: f64,
    pub range: f64,
    pub spread: f64,
    pub angle: f64,
    pub softness: f64,
    pub temperature: f64,
    pub mask_id: Option<u32>,
}
impl Default for Glow {
    fn default() -> Self {
        Self {
            enabled: false,
            style: "soft".into(),
            amount: 35.,
            range: 35.,
            spread: 35.,
            angle: 0.,
            softness: 50.,
            temperature: 0.,
            mask_id: None,
        }
    }
}
impl Glow {
    pub fn validate(&self) -> Result<(), String> {
        if !["soft", "directional", "motion", "streak"].contains(&self.style.as_str())
            || [self.amount, self.range, self.spread, self.softness]
                .iter()
                .any(|v| !v.is_finite() || !(0. ..=100.).contains(v))
            || !self.angle.is_finite()
            || !(-180. ..=180.).contains(&self.angle)
            || !self.temperature.is_finite()
            || !(-100. ..=100.).contains(&self.temperature)
        {
            return Err("Resplandor: parámetros fuera de rango".into());
        }
        Ok(())
    }
}
fn sample(img: &Rgb32f, x: f32, y: f32) -> [f32; 3] {
    if x < 0. || y < 0. || x > (img.width - 1) as f32 || y > (img.height - 1) as f32 {
        return [0.; 3];
    }
    let ix = x.floor() as usize;
    let iy = y.floor() as usize;
    let fx = x - ix as f32;
    let fy = y - iy as f32;
    let a = img.get(ix, iy);
    let b = img.get((ix + 1).min(img.width - 1), iy);
    let c = img.get(ix, (iy + 1).min(img.height - 1));
    let d = img.get((ix + 1).min(img.width - 1), (iy + 1).min(img.height - 1));
    std::array::from_fn(|k| {
        (a[k] * (1. - fx) + b[k] * fx) * (1. - fy) + (c[k] * (1. - fx) + d[k] * fx) * fy
    })
}
// An exponential directional convolution, evaluated by advecting the previous
// major-axis row/column. O(pixels), not sparse taps: long trails stay continuous.
// Positive angle points in image coordinates: right at 0°, down at 90°.
fn trail(source: &Rgb32f, angle: f32, length: f32) -> Rgb32f {
    let mut out = Rgb32f::new(source.width, source.height);
    let (dx, dy) = (angle.cos(), angle.sin());
    let horizontal = dx.abs() >= dy.abs();
    let major = if horizontal { dx } else { dy };
    let minor = if horizontal { dy } else { dx };
    let sign = if major >= 0. { 1. } else { -1. };
    let tangent = minor / major.abs().max(1e-6);
    let decay = (-1. / (length * major.abs()).max(0.25)).exp();
    let outer = if horizontal {
        source.width
    } else {
        source.height
    };
    let inner = if horizontal {
        source.height
    } else {
        source.width
    };
    for step in 0..outer {
        let u = if sign > 0. { step } else { outer - 1 - step };
        for v in 0..inner {
            let (x, y) = if horizontal { (u, v) } else { (v, u) };
            let (px, py) = if horizontal {
                (x as f32 - sign, y as f32 - tangent)
            } else {
                (x as f32 - tangent, y as f32 - sign)
            };
            let previous = sample(&out, px, py);
            let current = source.get(x, y);
            out.data[y * source.width + x] =
                std::array::from_fn(|k| current[k] * (1. - decay) + previous[k] * decay);
        }
    }
    out
}
#[cfg(test)]
fn directional_halo(highlights: &Rgb32f, s: &Glow) -> Rgb32f {
    directional_halo_quality(highlights, s, false)
}
fn directional_halo_quality(highlights: &Rgb32f, s: &Glow, photo: bool) -> Rgb32f {
    let spread = s.spread as f32 / 100.;
    let long = highlights.width.max(highlights.height) as f32;
    let streak = s.style == "streak";
    let length = (0.002 + if streak { 0.14 } else { 0.075 } * spread.powi(2)) * long;
    // For photos, width follows frame scale and softness, never trail length.
    // Extending a crisp trail must not turn it into a broad fog bank.
    let sigma = if photo {
        (long * (0.00045 + 0.004 * (s.softness as f32 / 100.).powi(2))).max(0.35)
    } else {
        0.35 + length * 0.12 * (s.softness as f32 / 100.).powi(2)
    };
    let base = gaussian(highlights, sigma);
    let forward = trail(&base, s.angle.to_radians() as f32, length);
    if !streak {
        return forward;
    }
    let backward = trail(&base, (s.angle + 180.).to_radians() as f32, length);
    Rgb32f::from_fn(base.width, base.height, |x, y| {
        let (a, b) = (forward.get(x, y), backward.get(x, y));
        std::array::from_fn(|k| (a[k] + b[k]) * 0.5)
    })
}
pub fn apply(d: &mut DeepImage, s: &Glow, mask: Option<(&lightcraft_develop::Mask, &Frame)>) {
    apply_quality(d, s, mask, false);
}
pub fn apply_photo(d: &mut DeepImage, s: &Glow, mask: Option<(&lightcraft_develop::Mask, &Frame)>) {
    apply_quality(d, s, mask, true);
}
// A small spread needs a finer grid to represent its thin trails; broader halos
// can use a coarser grid. The cap bounds memory regardless of source resolution.
fn working_edge(s: &Glow, photo: bool) -> f32 {
    if photo && ["motion", "streak"].contains(&s.style.as_str()) {
        2048. - 512. * (s.spread as f32 / 100.)
    } else {
        768.
    }
}
fn apply_quality(
    d: &mut DeepImage,
    s: &Glow,
    mask: Option<(&lightcraft_develop::Mask, &Frame)>,
    photo: bool,
) {
    if !s.enabled || s.amount <= 0. {
        return;
    }
    let DeepSamples::F32(v) = &mut d.samples else {
        return;
    };
    let (ow, oh) = (d.width, d.height);
    if ow == 0 || oh == 0 {
        return;
    }
    let scale = (working_edge(s, photo) / ow.max(oh) as f32).min(1.);
    let (w, h) = (
        ((ow as f32 * scale).round() as usize).max(1),
        ((oh as f32 * scale).round() as usize).max(1),
    );
    // Area averaging captures tiny bright reflections without aliasing at export size.
    let threshold = 0.85 - 0.7 * s.range as f32 / 100.;
    let mut highlights = Rgb32f::new(w, h);
    let mut source = Rgb32f::new(w, h);
    let mut counts = vec![0u32; w * h];
    for y in 0..oh {
        for x in 0..ow {
            let i = (y * h / oh) * w + x * w / ow;
            counts[i] += 1;
            let rgb = &v[(y * ow + x) * 3..(y * ow + x) * 3 + 3];
            let l = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
            let t = ((l - threshold) / (0.2 + threshold * 0.2)).clamp(0., 1.);
            let a = t * t * (3. - 2. * t);
            for k in 0..3 {
                source.data[i][k] += rgb[k];
                highlights.data[i][k] += rgb[k].max(0.) * a;
            }
        }
    }
    for ((p, highlight), n) in source.data.iter_mut().zip(&mut highlights.data).zip(counts) {
        for k in 0..3 {
            p[k] /= n.max(1) as f32;
            highlight[k] /= n.max(1) as f32;
        }
    }

    let coverage = mask.map(|(mask, frame)| {
        let log = Plane::from_fn(w, h, |x, y| {
            let p = source.get(x, y);
            (p[0] * 0.2126 + p[1] * 0.7152 + p[2] * 0.0722)
                .max(1e-6)
                .log2()
        });
        let mut region = mask.clone();
        region.adjust.amount = 100.;
        lightcraft_pipeline::masks::evaluate_one(&region, frame, w, h, &source, &log, 0., None)
    });
    // Deleted/hidden reference never silently falls back to the whole photo.
    if s.mask_id.is_some() && coverage.is_none() {
        return;
    }
    // Preserve the exact threshold/downsampling behavior of existing styles.
    if !["motion", "streak"].contains(&s.style.as_str()) {
        highlights = Rgb32f::from_fn(w, h, |x, y| {
            let p = source.get(x, y);
            let l = p[0] * 0.2126 + p[1] * 0.7152 + p[2] * 0.0722;
            let t = ((l - threshold) / (0.2 + threshold * 0.2)).clamp(0., 1.);
            p.map(|c| c.max(0.) * t * t * (3. - 2. * t))
        });
    }
    let radius = (0.003 + 0.065 * (s.spread as f32 / 100.).powi(2)) * w.max(h) as f32;
    let mut halo = if ["motion", "streak"].contains(&s.style.as_str()) {
        directional_halo_quality(&highlights, s, photo)
    } else {
        gaussian(&highlights, radius.max(0.6))
    };
    if s.style == "directional" {
        let base = gaussian(&highlights, (radius * 0.12).max(0.6));
        let angle = s.angle.to_radians() as f32;
        let (dx, dy) = (angle.cos() * radius * 3., angle.sin() * radius * 3.);
        halo = Rgb32f::from_fn(w, h, |x, y| {
            let mut sum = [0.; 3];
            let mut weights = 0.;
            for j in -24..=24 {
                let t = j as f32 / 24.;
                let weight = (-3. * t * t).exp();
                let p = sample(&base, x as f32 + t * dx, y as f32 + t * dy);
                for k in 0..3 {
                    sum[k] += p[k] * weight;
                }
                weights += weight;
            }
            sum.map(|c| c / weights)
        });
    }
    let tint = s.temperature as f32 / 100.;
    let color = [1. + 0.25 * tint, 1., 1. - 0.25 * tint];
    let directional = ["motion", "streak"].contains(&s.style.as_str());
    let amount = s.amount as f32 / 100. * if directional { 3. } else { 1.5 };
    for y in 0..oh {
        for x in 0..ow {
            let gx = ((x as f32 + 0.5) * w as f32 / ow as f32 - 0.5).clamp(0., (w - 1) as f32);
            let gy = ((y as f32 + 0.5) * h as f32 / oh as f32 - 0.5).clamp(0., (h - 1) as f32);
            let p = sample(&halo, gx, gy);
            let a = coverage.as_ref().map_or(1., |m| {
                let (ix, iy) = (gx.floor() as usize, gy.floor() as usize);
                let (fx, fy) = (gx - ix as f32, gy - iy as f32);
                let top = m.get(ix, iy) * (1. - fx) + m.get((ix + 1).min(w - 1), iy) * fx;
                let bottom = m.get(ix, (iy + 1).min(h - 1)) * (1. - fx)
                    + m.get((ix + 1).min(w - 1), (iy + 1).min(h - 1)) * fx;
                (top * (1. - fy) + bottom * fy).clamp(0., 1.)
            });
            for k in 0..3 {
                let i = (y * ow + x) * 3 + k;
                let base = v[i];
                let headroom = 1. - base.clamp(0., 1.);
                let contribution = p[k] * color[k] * amount * a;
                v[i] = if directional {
                    // Gentler highlight protection than legacy bloom, bounded at white.
                    (base + contribution * headroom.sqrt()).min(base.max(1.))
                } else {
                    base + contribution * headroom
                };
            }
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn image() -> DeepImage {
        DeepImage {
            width: 97,
            height: 97,
            space: Default::default(),
            samples: DeepSamples::F32(
                (0..97 * 97)
                    .flat_map(|i| if i == 48 * 97 + 48 { [1.; 3] } else { [0.; 3] })
                    .collect(),
            ),
        }
    }
    fn moments(img: &Rgb32f, cx: f32, cy: f32) -> (f32, f32, f32) {
        let mut energy = 0.;
        let mut xx = 0.;
        let mut yy = 0.;
        for y in 0..img.height {
            for x in 0..img.width {
                let v = img.get(x, y)[0];
                energy += v;
                xx += v * (x as f32 - cx).powi(2);
                yy += v * (y as f32 - cy).powi(2);
            }
        }
        (energy, xx / energy.max(1e-12), yy / energy.max(1e-12))
    }
    #[test]
    fn photo_spread_changes_length_without_widening_cross_section() {
        let mut src = Rgb32f::new(513, 513);
        src.data[256 * 513 + 256] = [1.; 3];
        let s = Glow {
            style: "motion".into(),
            spread: 20.,
            softness: 70.,
            ..Default::default()
        };
        let a = moments(&directional_halo_quality(&src, &s, true), 256., 256.);
        let b = moments(
            &directional_halo_quality(&src, &Glow { spread: 90., ..s }, true),
            256.,
            256.,
        );
        assert!(b.1 > a.1 * 10., "spread must extend the trail");
        assert!(
            (a.2 - b.2).abs() < 0.02,
            "spread must not widen it: {a:?} {b:?}"
        );
        assert!(a.0 > 0.99 && b.0 > 0.99 && b.0 < 1.01);
    }
    #[test]
    fn photo_softness_changes_width_without_changing_direction() {
        let mut src = Rgb32f::new(257, 257);
        src.data[128 * 257 + 128] = [1.; 3];
        let s = Glow {
            style: "motion".into(),
            spread: 70.,
            softness: 0.,
            ..Default::default()
        };
        let a = moments(&directional_halo_quality(&src, &s, true), 128., 128.);
        let b = moments(
            &directional_halo_quality(
                &src,
                &Glow {
                    softness: 100.,
                    ..s
                },
                true,
            ),
            128.,
            128.,
        );
        assert!(b.2 > a.2 * 5.);
        assert!((a.1 - b.1).abs() / a.1 < 0.08);
    }
    #[test]
    fn photo_grid_adapts_and_legacy_grid_is_unchanged() {
        for spread in [0., 25., 70., 100.] {
            let s = Glow {
                style: "motion".into(),
                spread,
                ..Default::default()
            };
            assert!((1536. ..=2048.).contains(&working_edge(&s, true)));
            assert_eq!(working_edge(&s, false), 768.);
            assert_eq!(
                working_edge(
                    &Glow {
                        style: "soft".into(),
                        ..s
                    },
                    true
                ),
                768.
            );
        }
    }
    #[test]
    fn photo_dark_pixels_do_not_generate_trails() {
        let mut d = image();
        let DeepSamples::F32(v) = &mut d.samples else {
            panic!()
        };
        v.fill(0.08);
        let before = d.clone();
        apply_photo(
            &mut d,
            &Glow {
                enabled: true,
                style: "motion".into(),
                range: 0.,
                amount: 100.,
                ..Default::default()
            },
            None,
        );
        assert_eq!(d, before);
    }
    #[test]
    fn photo_streak_is_symmetric_and_rotates() {
        let mut src = Rgb32f::new(129, 129);
        src.data[64 * 129 + 64] = [1.; 3];
        let s = Glow {
            style: "streak".into(),
            spread: 80.,
            softness: 20.,
            ..Default::default()
        };
        let a = directional_halo_quality(&src, &s, true);
        let b = directional_halo_quality(&src, &Glow { angle: 90., ..s }, true);
        assert!((a.get(54, 64)[0] - a.get(74, 64)[0]).abs() < 1e-5);
        assert!((a.get(54, 64)[0] - b.get(64, 54)[0]).abs() < 1e-5);
    }
    #[test]
    fn photo_legacy_styles_and_missing_mask_are_unchanged() {
        for style in ["soft", "directional"] {
            let mut a = image();
            let mut b = a.clone();
            let s = Glow {
                enabled: true,
                style: style.into(),
                amount: 70.,
                ..Default::default()
            };
            apply(&mut a, &s, None);
            apply_photo(&mut b, &s, None);
            assert_eq!(a, b);
        }
        let mut a = image();
        let before = a.clone();
        apply_photo(
            &mut a,
            &Glow {
                enabled: true,
                style: "motion".into(),
                mask_id: Some(9),
                ..Default::default()
            },
            None,
        );
        assert_eq!(a, before);
    }
    #[test]
    fn tiny_reflections_survive_large_photo_rendering() {
        let w = 2400;
        let h = 128;
        let source = DeepImage {
            width: w,
            height: h,
            space: Default::default(),
            samples: DeepSamples::F32(
                (0..w * h)
                    .flat_map(|i| if i == 64 * w + 1100 { [1.; 3] } else { [0.; 3] })
                    .collect(),
            ),
        };
        for style in ["motion", "streak"] {
            let s = Glow {
                enabled: true,
                style: style.into(),
                amount: 100.,
                spread: 40.,
                softness: 0.,
                ..Default::default()
            };
            let mut d = source.clone();
            apply_photo(&mut d, &s, None);
            let DeepSamples::F32(v) = d.samples else {
                panic!()
            };
            assert!(
                v[(64 * w + 1110) * 3] > 0.0001,
                "tiny reflection must emit a trail"
            );
            assert!(v.iter().all(|v| v.is_finite() && *v >= 0. && *v <= 1.));
            assert_eq!(v[0], 0.);
        }
    }
    #[test]
    fn disabled_identity() {
        let mut d = image();
        let before = format!("{:?}", d.samples);
        apply(&mut d, &Glow::default(), None);
        assert_eq!(before, format!("{:?}", d.samples));
    }
    #[test]
    fn bloom_spreads() {
        let mut d = image();
        apply(
            &mut d,
            &Glow {
                enabled: true,
                ..Default::default()
            },
            None,
        );
        let DeepSamples::F32(p) = d.samples else {
            panic!()
        };
        assert!(p[(48 * 97 + 49) * 3] > 0.);
        assert!(p[0] < 1e-5);
        assert_eq!(p[(48 * 97 + 48) * 3], 1.);
        assert!(p.iter().all(|v| v.is_finite()));
    }
    #[test]
    fn directional_rotation() {
        let s = Glow {
            enabled: true,
            style: "directional".into(),
            spread: 70.,
            ..Default::default()
        };
        let mut a = image();
        apply(&mut a, &s, None);
        let mut b = image();
        apply(&mut b, &Glow { angle: 90., ..s }, None);
        let (DeepSamples::F32(a), DeepSamples::F32(b)) = (a.samples, b.samples) else {
            panic!()
        };
        assert!(a[(48 * 97 + 55) * 3] > a[(55 * 97 + 48) * 3] * 2.);
        assert!((a[(48 * 97 + 55) * 3] - b[(55 * 97 + 48) * 3]).abs() < 1e-5);
    }
    #[test]
    fn motion_is_one_sided_and_angle_reverses_it() {
        let mut source = Rgb32f::new(97, 97);
        source.data[48 * 97 + 48] = [1.; 3];
        let a = trail(&source, 0., 10.);
        let b = trail(&source, std::f32::consts::PI, 10.);
        assert!(a.get(55, 48)[0] > 0.03);
        assert_eq!(a.get(41, 48)[0], 0.);
        assert!((a.get(55, 48)[0] - b.get(41, 48)[0]).abs() < 1e-5);
        for x in 49..80 {
            assert!(a.get(x, 48)[0] > a.get(x + 1, 48)[0]);
        }
        let energy: f32 = a.data.iter().map(|p| p[0]).sum();
        assert!(energy > 0.98 && energy <= 1.001);
    }
    #[test]
    fn streak_is_two_sided_and_softness_widens_it() {
        let mut source = Rgb32f::new(97, 97);
        source.data[48 * 97 + 48] = [1.; 3];
        let settings = Glow {
            style: "streak".into(),
            spread: 90.,
            softness: 0.,
            ..Default::default()
        };
        let crisp = directional_halo(&source, &settings);
        assert!((crisp.get(40, 48)[0] - crisp.get(56, 48)[0]).abs() < 1e-5);
        assert!(crisp.get(40, 48)[0] > 0.);
        let soft = directional_halo(
            &source,
            &Glow {
                softness: 100.,
                ..settings
            },
        );
        assert!(soft.get(56, 51)[0] > crisp.get(56, 51)[0]);
        assert!(soft.get(48, 48)[0] < crisp.get(48, 48)[0]);
    }
    #[test]
    fn motion_dark_image_is_unchanged_and_zero_amount_is_identity() {
        let mut image = image();
        let DeepSamples::F32(p) = &mut image.samples else {
            panic!()
        };
        p.fill(0.);
        apply(
            &mut image,
            &Glow {
                enabled: true,
                style: "motion".into(),
                amount: 100.,
                ..Default::default()
            },
            None,
        );
        let DeepSamples::F32(p) = &image.samples else {
            panic!()
        };
        assert!(p.iter().all(|v| *v == 0.));
        let mut image = super::tests::image();
        let before = image.clone();
        apply(
            &mut image,
            &Glow {
                enabled: true,
                style: "streak".into(),
                amount: 0.,
                ..Default::default()
            },
            None,
        );
        assert_eq!(image, before);
    }
    #[test]
    fn old_glow_without_softness_keeps_legacy_style() {
        let old: Glow = serde_json::from_str(r#"{"enabled":true,"style":"directional"}"#).unwrap();
        assert_eq!(old.style, "directional");
        assert_eq!(old.softness, 50.);
        assert!(old.validate().is_ok());
        assert!(
            Glow {
                softness: 101.,
                ..old
            }
            .validate()
            .is_err()
        );
    }
    #[test]
    fn invalid_rejected() {
        assert!(
            Glow {
                amount: f64::NAN,
                ..Default::default()
            }
            .validate()
            .is_err()
        );
        assert!(
            Glow {
                style: "other".into(),
                ..Default::default()
            }
            .validate()
            .is_err()
        );
    }
    #[test]
    fn missing_mask() {
        let mut a = image();
        let before = format!("{:?}", a.samples);
        apply(
            &mut a,
            &Glow {
                enabled: true,
                mask_id: Some(4),
                ..Default::default()
            },
            None,
        );
        assert_eq!(before, format!("{:?}", a.samples));
    }
}
