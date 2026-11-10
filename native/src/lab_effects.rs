//! Destructive-free creative effects, in output-linear RGB before final encoding.
use lightcraft_pipeline::{DeepImage, DeepSamples};
use serde::{Deserialize, Serialize};
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Curve {
    pub points: Vec<[f64; 2]>,
    pub distance: f64,
    pub influence: f64,
}
impl Default for Curve {
    fn default() -> Self {
        Self {
            points: vec![[0.3, 0.5], [0.7, 0.5], [0.5, 0.35]],
            distance: 15.,
            influence: 55.,
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Stroke {
    pub points: Vec<[f64; 2]>,
    pub size: f64,
    pub feather: f64,
    pub erase: bool,
}
impl Default for Stroke {
    fn default() -> Self {
        Self {
            points: vec![],
            size: 0.12,
            feather: 80.,
            erase: false,
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Window {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub feather: f64,
    pub border: f64,
}
impl Default for Window {
    fn default() -> Self {
        Self {
            x: 0.35,
            y: 0.35,
            width: 0.3,
            height: 0.3,
            feather: 0.,
            border: 0.,
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Effects {
    pub stack: bool,
    pub layers: Vec<Effects>,
    pub paths: Vec<Curve>,
    pub strokes: Vec<Stroke>,
    pub enabled: bool,
    pub mode: String,
    pub amount: f64,
    pub distance: f64,
    pub band_width: f64,
    pub transition: f64,
    pub sharpness: f64,
    pub dissolve: f64,
    pub particle_size: f64,
    pub points: Vec<[f64; 2]>,
    pub windows: Vec<Window>,
}
impl Default for Effects {
    fn default() -> Self {
        Self {
            stack: false,
            layers: vec![],
            paths: vec![],
            strokes: vec![],
            enabled: false,
            mode: "motion".into(),
            amount: 70.,
            distance: 15.,
            band_width: 20.,
            transition: 30.,
            sharpness: 0.,
            dissolve: 0.,
            particle_size: 1.,
            points: vec![[0.3, 0.5], [0.7, 0.5], [0.5, 0.35]],
            windows: vec![],
        }
    }
}
impl Effects {
    pub fn validate(&self) -> Result<(), String> {
        if self.layers.len() > 6 || self.layers.iter().any(|e| e.stack || !e.layers.is_empty()) {
            return Err("Máximo seis efectos, sin capas anidadas".into());
        }
        for e in &self.layers {
            e.validate()?;
        }
        let valid_points = |points: &Vec<[f64; 2]>| {
            points
                .iter()
                .flatten()
                .all(|v| v.is_finite() && (0. ..=1.).contains(v))
        };
        if self.paths.len() > 8
            || self.strokes.len() > 128
            || self.strokes.iter().map(|s| s.points.len()).sum::<usize>() > 8192
        {
            return Err("Demasiadas curvas o pinceladas".into());
        }
        for p in &self.paths {
            if p.points.len() != 3
                || !valid_points(&p.points)
                || !p.distance.is_finite()
                || !(0. ..=100.).contains(&p.distance)
                || !p.influence.is_finite()
                || !(5. ..=100.).contains(&p.influence)
            {
                return Err("Curva inválida".into());
            }
        }
        for b in &self.strokes {
            if b.points.is_empty()
                || !valid_points(&b.points)
                || !b.size.is_finite()
                || !(0.005..=0.6).contains(&b.size)
                || !b.feather.is_finite()
                || !(0. ..=100.).contains(&b.feather)
            {
                return Err("Pincel de nitidez inválido".into());
            }
        }

        if !["motion", "tiltShift", "path"].contains(&self.mode.as_str())
            || self.points.len() != 3
            || self.windows.len() > 8
        {
            return Err("Efecto de laboratorio inválido".into());
        }
        for v in [
            self.amount,
            self.distance,
            self.band_width,
            self.transition,
            self.sharpness,
            self.dissolve,
            self.particle_size,
        ] {
            if !v.is_finite() || !(0. ..=100.).contains(&v) {
                return Err("Valor de efecto fuera de rango".into());
            }
        }
        if self
            .points
            .iter()
            .flatten()
            .any(|v| !v.is_finite() || !(0. ..=1.).contains(v))
        {
            return Err("Trayectoria inválida".into());
        }
        for w in &self.windows {
            if [w.x, w.y, w.width, w.height, w.feather, w.border]
                .iter()
                .any(|v| !v.is_finite())
                || w.x < 0.
                || w.y < 0.
                || w.width < 0.005
                || w.height < 0.005
                || w.x + w.width > 1.000001
                || w.y + w.height > 1.000001
                || !(0. ..=100.).contains(&w.feather)
                || !(0. ..=24.).contains(&w.border)
            {
                return Err("Ventana de enfoque inválida".into());
            }
        }
        Ok(())
    }
}
fn smooth(a: f32, b: f32, x: f32) -> f32 {
    let t = ((x - a) / (b - a).max(1e-6)).clamp(0., 1.);
    t * t * (3. - 2. * t)
}
fn sample(v: &[f32], w: usize, h: usize, x: f32, y: f32) -> [f32; 3] {
    let x = x.clamp(0., (w - 1) as f32);
    let y = y.clamp(0., (h - 1) as f32);
    let ix = x.floor() as usize;
    let iy = y.floor() as usize;
    let nx = (ix + 1).min(w - 1);
    let ny = (iy + 1).min(h - 1);
    let fx = x - ix as f32;
    let fy = y - iy as f32;
    std::array::from_fn(|c| {
        let a = v[(iy * w + ix) * 3 + c] * (1. - fx) + v[(iy * w + nx) * 3 + c] * fx;
        let b = v[(ny * w + ix) * 3 + c] * (1. - fx) + v[(ny * w + nx) * 3 + c] * fx;
        a * (1. - fy) + b * fy
    })
}
// Sliding box passes approximate a Gaussian without a cost proportional to the blur radius.
fn soft_blur(v: &[f32], w: usize, h: usize, r: usize) -> Vec<f32> {
    if r == 0 {
        return v.to_vec();
    }
    let mut a = v.to_vec();
    let mut b = vec![0.; v.len()];
    for _ in 0..3 {
        for y in 0..h {
            for c in 0..3 {
                let mut sum = 0.;
                let mut left = 0;
                let mut right = 0;
                for x in 0..w {
                    let hi = (x + r + 1).min(w);
                    while right < hi {
                        sum += a[(y * w + right) * 3 + c];
                        right += 1;
                    }
                    let lo = x.saturating_sub(r);
                    while left < lo {
                        sum -= a[(y * w + left) * 3 + c];
                        left += 1;
                    }
                    b[(y * w + x) * 3 + c] = sum / (right - left) as f32;
                }
            }
        }
        std::mem::swap(&mut a, &mut b);
        for x in 0..w {
            for c in 0..3 {
                let mut sum = 0.;
                let mut top = 0;
                let mut bottom = 0;
                for y in 0..h {
                    let hi = (y + r + 1).min(h);
                    while bottom < hi {
                        sum += a[(bottom * w + x) * 3 + c];
                        bottom += 1;
                    }
                    let lo = y.saturating_sub(r);
                    while top < lo {
                        sum -= a[(top * w + x) * 3 + c];
                        top += 1;
                    }
                    b[(y * w + x) * 3 + c] = sum / (bottom - top) as f32;
                }
            }
        }
        std::mem::swap(&mut a, &mut b);
    }
    a
}
fn noise(x: u32, y: u32) -> f32 {
    let mut n = x.wrapping_mul(374761393) ^ y.wrapping_mul(668265263) ^ 0x9e3779b9;
    n = (n ^ (n >> 13)).wrapping_mul(1274126177);
    ((n ^ (n >> 16)) & 65535) as f32 / 65535.
}
fn organic_noise(x: f32, y: f32) -> f32 {
    let value = |x: f32, y: f32| {
        let ix = x.floor() as u32;
        let iy = y.floor() as u32;
        let fx = smooth(0., 1., x.fract());
        let fy = smooth(0., 1., y.fract());
        let a = noise(ix, iy) * (1. - fx) + noise(ix + 1, iy) * fx;
        let b = noise(ix, iy + 1) * (1. - fx) + noise(ix + 1, iy + 1) * fx;
        a * (1. - fy) + b * fy
    };
    (value(x * 0.91 + y * 0.34 + 13., y * 0.91 - x * 0.34 + 10000.) * 0.7
        + noise((x * 2.37) as u32, (y * 2.37) as u32) * 0.3)
        .clamp(0., 1.)
}
fn segment_distance(x: f32, y: f32, a: [f32; 2], b: [f32; 2]) -> f32 {
    let dx = b[0] - a[0];
    let dy = b[1] - a[1];
    let t = (((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy).max(0.001)).clamp(0., 1.);
    (x - a[0] - dx * t).hypot(y - a[1] - dy * t)
}
fn path_blur(original: &[f32], out: &mut [f32], w: usize, h: usize, paths: &[Curve]) {
    let long = w.max(h) as f32;
    let prepared = paths
        .iter()
        .map(|p| {
            let a = [
                p.points[0][0] as f32 * w as f32,
                p.points[0][1] as f32 * h as f32,
            ];
            let b = [
                p.points[1][0] as f32 * w as f32,
                p.points[1][1] as f32 * h as f32,
            ];
            let c = [
                p.points[2][0] as f32 * w as f32,
                p.points[2][1] as f32 * h as f32,
            ];
            let center = [(a[0] + b[0]) / 2., (a[1] + b[1]) / 2.];
            let length = (b[0] - a[0]).hypot(b[1] - a[1]).max(long * 0.05);
            let bezier = |t: f32| {
                let u = 1. - t;
                [
                    u * u * a[0] + 2. * u * t * c[0] + t * t * b[0],
                    u * u * a[1] + 2. * u * t * c[1] + t * t * b[1],
                ]
            };
            let offsets = (0..48)
                .map(|k| {
                    let q = bezier(k as f32 / 47.);
                    [
                        (q[0] - center[0]) / length * p.distance as f32 / 100. * long * 0.15,
                        (q[1] - center[1]) / length * p.distance as f32 / 100. * long * 0.15,
                    ]
                })
                .collect::<Vec<_>>();
            let line = (0..9).map(|k| bezier(k as f32 / 8.)).collect::<Vec<_>>();
            (line, offsets, p.influence as f32 / 100. * long * 0.6)
        })
        .collect::<Vec<_>>();
    let workers = if w * h > 100_000 {
        std::thread::available_parallelism().map_or(1, |n| n.get().min(4))
    } else {
        1
    };
    let rows = h.div_ceil(workers);
    std::thread::scope(|scope| {
        for (chunk_index, chunk) in out.chunks_mut(rows * w * 3).enumerate() {
            let prepared = &prepared;
            scope.spawn(move || {
                for (i, pixel) in chunk.chunks_exact_mut(3).enumerate() {
                    let x = (i % w) as f32;
                    let y = (chunk_index * rows + i / w) as f32;
                    let mut weights = [0.; 8];
                    let mut total = 0.005;
                    for (j, (line, _, radius)) in prepared.iter().enumerate() {
                        let distance = line
                            .windows(2)
                            .map(|p| segment_distance(x, y, p[0], p[1]))
                            .fold(f32::INFINITY, f32::min);
                        let weight = (-distance * distance / (radius * radius).max(1.) * 3.).exp();
                        weights[j] = weight;
                        total += weight;
                    }
                    let mut sum = [0.; 3];
                    for k in 0..48 {
                        let mut o = [0.; 2];
                        for (j, (_, offsets, _)) in prepared.iter().enumerate() {
                            o[0] += offsets[k][0] * weights[j] / total;
                            o[1] += offsets[k][1] * weights[j] / total;
                        }
                        let rgb = sample(original, w, h, x + o[0], y + o[1]);
                        for c in 0..3 {
                            sum[c] += rgb[c];
                        }
                    }
                    for c in 0..3 {
                        pixel[c] = sum[c] / 48.;
                    }
                }
            });
        }
    });
}
fn paint_protection(w: usize, h: usize, strokes: &[Stroke]) -> Vec<f32> {
    if strokes.is_empty() {
        return vec![];
    }
    let mut mask = vec![0f32; w * h];
    let long = w.max(h) as f32;
    for s in strokes {
        let r = (s.size as f32 * long / 2.).max(1.);
        let inner = r * (1. - s.feather as f32 / 100.).min(0.99);
        let mut dabs = vec![[
            s.points[0][0] as f32 * w as f32,
            s.points[0][1] as f32 * h as f32,
        ]];
        for p in s.points.windows(2) {
            let a = [p[0][0] as f32 * w as f32, p[0][1] as f32 * h as f32];
            let b = [p[1][0] as f32 * w as f32, p[1][1] as f32 * h as f32];
            let steps = ((b[0] - a[0]).hypot(b[1] - a[1]) / (r * 0.2).max(1.))
                .ceil()
                .max(1.) as usize;
            for k in 1..=steps {
                let t = k as f32 / steps as f32;
                dabs.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
            }
        }
        let mut stroke = vec![0f32; w * h];
        for p in dabs {
            let x0 = (p[0] - r).floor().max(0.) as usize;
            let y0 = (p[1] - r).floor().max(0.) as usize;
            let x1 = ((p[0] + r).ceil() as usize + 1).min(w);
            let y1 = ((p[1] + r).ceil() as usize + 1).min(h);
            for y in y0..y1 {
                for x in x0..x1 {
                    let alpha = 1. - smooth(inner, r, (x as f32 - p[0]).hypot(y as f32 - p[1]));
                    stroke[y * w + x] = stroke[y * w + x].max(alpha);
                }
            }
        }
        for (i, a) in stroke.iter().enumerate() {
            if s.erase {
                mask[i] *= 1. - a;
            } else {
                mask[i] = mask[i].max(*a);
            }
        }
    }
    mask
}
pub fn apply(d: &mut DeepImage, s: &Effects) {
    if !s.enabled || d.width == 0 || d.height == 0 {
        return;
    }
    if s.stack {
        for layer in &s.layers {
            apply(d, layer);
        }
        return;
    }
    let DeepSamples::F32(v) = &mut d.samples else {
        return;
    };
    let w = d.width;
    let h = d.height;
    let long = w.max(h) as f32;
    let original = v.clone();
    let p = s
        .points
        .iter()
        .map(|p| [p[0] as f32 * w as f32, p[1] as f32 * h as f32])
        .collect::<Vec<_>>();
    let dx = p[1][0] - p[0][0];
    let dy = p[1][1] - p[0][1];
    let length = dx.hypot(dy).max(1.);
    let nx = dx / length;
    let ny = dy / length;
    let center = [(p[0][0] + p[1][0]) / 2., (p[0][1] + p[1][1]) / 2.];
    let distance = s.distance as f32 / 100. * long * 0.15;
    let mut blurred = if s.mode == "tiltShift" {
        soft_blur(&original, w, h, (distance / 3.).round() as usize)
    } else {
        vec![0.; v.len()]
    };
    if s.mode == "path" {
        let paths = if s.paths.is_empty() {
            vec![Curve {
                points: s.points.clone(),
                distance: s.distance,
                ..Default::default()
            }]
        } else {
            s.paths.clone()
        };
        path_blur(&original, &mut blurred, w, h, &paths);
    } else if s.mode == "motion" {
        let offsets = (0..48)
            .map(|k| {
                let t = k as f32 / 47. - 0.5;
                [nx * distance * t, ny * distance * t]
            })
            .collect::<Vec<_>>();
        for y in 0..h {
            for x in 0..w {
                let mut sum = [0.; 3];
                for o in &offsets {
                    let rgb = sample(&original, w, h, x as f32 + o[0], y as f32 + o[1]);
                    for c in 0..3 {
                        sum[c] += rgb[c];
                    }
                }
                for c in 0..3 {
                    blurred[(y * w + x) * 3 + c] = sum[c] / 48.;
                }
            }
        }
    }
    let protection = if s.mode == "path" {
        paint_protection(w, h, &s.strokes)
    } else {
        vec![]
    };
    let half = s.band_width as f32 / 100. * long * 0.4;
    let fade = (s.transition as f32 / 100. * long * 0.2).max(1.);
    let mix = s.amount as f32 / 100.;
    let sharp = s.sharpness as f32 / 100.;
    let particle = (long / 1500. * (0.55 + s.particle_size as f32 / 100. * 2.5)).max(0.65);
    for y in 0..h {
        for x in 0..w {
            let mut a = mix;
            if s.mode == "tiltShift" {
                let perpendicular =
                    ((x as f32 - center[0]) * -ny + (y as f32 - center[1]) * nx).abs();
                a *= smooth(half, half + fade, perpendicular);
            }
            for window in &s.windows {
                let left = window.x as f32 * w as f32;
                let top = window.y as f32 * h as f32;
                let right = left + window.width as f32 * w as f32;
                let bottom = top + window.height as f32 * h as f32;
                let inside = (x as f32 - left)
                    .min(right - x as f32)
                    .min(y as f32 - top)
                    .min(bottom - y as f32);
                let f = window.feather as f32 / 100. * long * 0.03;
                let protect = if f < 0.01 {
                    if inside >= 0. { 1. } else { 0. }
                } else {
                    smooth(-f, f, inside)
                };
                a *= 1. - protect;
            }
            if !protection.is_empty() {
                a *= 1. - protection[y * w + x];
            }
            let i = (y * w + x) * 3;
            let dissolve = if s.mode == "tiltShift" {
                s.dissolve as f32 / 100.
            } else {
                0.
            };
            // Continuous, zero-centred microtexture avoids binary holes and posterized halos.
            let grain_gain = if dissolve > 0. {
                let changed = (0..3)
                    .map(|c| (blurred[i + c] - original[i + c]).abs())
                    .sum::<f32>()
                    / 3.;
                let n = smooth(
                    0.18,
                    0.82,
                    organic_noise(x as f32 / particle, y as f32 / particle),
                );
                (n - 0.5) * 1.2 * dissolve * smooth(0.0005, 0.02, changed)
            } else {
                0.
            };
            for c in 0..3 {
                let motion = blurred[i + c] * (1. - sharp) + original[i + c] * sharp;
                let base = original[i + c] * (1. - a) + motion * a;
                v[i + c] = (base * (1. + grain_gain * a)).max(0.);
            }
            for window in &s.windows {
                if window.border <= 0. {
                    continue;
                }
                let l = window.x as f32 * w as f32;
                let t = window.y as f32 * h as f32;
                let r = l + window.width as f32 * w as f32;
                let b = t + window.height as f32 * h as f32;
                let border = window.border as f32 * long / 1500.;
                let xx = x as f32;
                let yy = y as f32;
                if xx >= l
                    && xx <= r
                    && yy >= t
                    && yy <= b
                    && (xx - l).min(r - xx).min(yy - t).min(b - yy) < border
                {
                    v[i] = 1.;
                    v[i + 1] = 1.;
                    v[i + 2] = 1.;
                }
            }
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use lightcraft_develop::DevelopSettings;
    use lightcraft_pipeline::{
        OutputDepth, RenderRequest, SourceInfo, StageCache, render_deep_cached,
    };
    use lightcraft_raster::Rgb32f;
    use std::sync::Arc;
    fn image() -> DeepImage {
        let p = Arc::new(Rgb32f {
            width: 80,
            height: 60,
            data: (0..4800)
                .map(|i| if i % 80 < 40 { [0.05; 3] } else { [0.8; 3] })
                .collect(),
        });
        let mut r = RenderRequest::fit(80, 60);
        r.depth = OutputDepth::F32Linear;
        render_deep_cached(
            &p,
            &SourceInfo::default(),
            &DevelopSettings::default(),
            &r,
            &StageCache::default(),
        )
        .unwrap()
    }
    #[test]
    fn effects_are_reversible_deterministic_and_protect_original_pixels() {
        let mut d = image();
        let original = d.clone();
        let mut s = Effects::default();
        apply(&mut d, &s);
        if let (DeepSamples::F32(a), DeepSamples::F32(b)) = (&d.samples, &original.samples) {
            assert_eq!(a, b);
        }
        s.enabled = true;
        s.distance = 80.;
        s.dissolve = 70.;
        s.windows.push(Window {
            x: 0.3,
            y: 0.3,
            width: 0.4,
            height: 0.4,
            ..Default::default()
        });
        s.validate().unwrap();
        apply(&mut d, &s);
        let mut again = original.clone();
        apply(&mut again, &s);
        if let (DeepSamples::F32(a), DeepSamples::F32(b), DeepSamples::F32(o)) =
            (&d.samples, &again.samples, &original.samples)
        {
            assert_eq!(a, b);
            assert_eq!(
                &a[(30 * 80 + 40) * 3..(30 * 80 + 40) * 3 + 3],
                &o[(30 * 80 + 40) * 3..(30 * 80 + 40) * 3 + 3]
            );
            assert_ne!(a, o);
        }
    }
    #[test]
    fn rejects_invalid_geometry() {
        let mut s = Effects::default();
        s.windows.push(Window {
            x: 0.9,
            ..Default::default()
        });
        assert!(s.validate().is_err());
        s.windows.clear();
        s.points[0][0] = f64::NAN;
        assert!(s.validate().is_err());
    }
}

#[cfg(test)]
mod local_effect_tests {
    use super::*;
    use lightcraft_pipeline::OutputSpace;
    fn fixture() -> DeepImage {
        DeepImage {
            width: 120,
            height: 80,
            space: OutputSpace::default(),
            samples: DeepSamples::F32(
                (0..9600)
                    .flat_map(|i| {
                        let x = i % 120;
                        let y = i / 120;
                        let v = if (x / 7 + y / 9) % 2 == 0 { 0.04 } else { 0.8 };
                        [v; 3]
                    })
                    .collect(),
            ),
        }
    }
    #[test]
    fn brush_has_a_fully_protected_center_and_soft_edge() {
        let stroke = Stroke {
            points: vec![[0.5, 0.5]],
            size: 0.4,
            feather: 80.,
            erase: false,
        };
        let mask = paint_protection(100, 100, &[stroke.clone()]);
        assert_eq!(mask[50 * 100 + 50], 1.);
        assert!(mask[50 * 100 + 62] > 0. && mask[50 * 100 + 62] < 1.);
        assert_eq!(mask[50 * 100 + 75], 0.);
        let cleared = paint_protection(
            100,
            100,
            &[
                stroke.clone(),
                Stroke {
                    erase: true,
                    ..stroke
                },
            ],
        );
        assert_eq!(cleared[50 * 100 + 50], 0.);
    }
    #[test]
    fn path_brush_restores_baseline_and_dissolve_is_ignored() {
        let original = fixture();
        let mut s = Effects {
            enabled: true,
            mode: "path".into(),
            distance: 90.,
            amount: 100.,
            ..Default::default()
        };
        let mut blurred = original.clone();
        apply(&mut blurred, &s);
        s.dissolve = 100.;
        let mut same = original.clone();
        apply(&mut same, &s);
        assert_eq!(blurred, same);
        s.strokes.push(Stroke {
            points: vec![[0.5, 0.5]],
            size: 0.4,
            ..Default::default()
        });
        let mut protected = original.clone();
        apply(&mut protected, &s);
        if let (DeepSamples::F32(a), DeepSamples::F32(b), DeepSamples::F32(c)) =
            (&protected.samples, &original.samples, &blurred.samples)
        {
            let i = (40 * 120 + 60) * 3;
            assert_eq!(&a[i..i + 3], &b[i..i + 3]);
            assert_ne!(a, c);
        }
    }
    #[test]
    fn multiple_curves_form_a_local_field_and_layers_combine() {
        let original = fixture();
        let first = Curve {
            points: vec![[0.05, 0.25], [0.4, 0.25], [0.2, 0.1]],
            distance: 90.,
            influence: 25.,
        };
        let second = Curve {
            points: vec![[0.8, 0.1], [0.8, 0.9], [0.95, 0.5]],
            distance: 65.,
            influence: 25.,
        };
        let mut path = Effects {
            enabled: true,
            mode: "path".into(),
            amount: 100.,
            paths: vec![first],
            ..Default::default()
        };
        let mut one = original.clone();
        apply(&mut one, &path);
        path.paths.push(second);
        let mut two = original.clone();
        apply(&mut two, &path);
        assert_ne!(one, two);
        let band = Effects {
            enabled: true,
            mode: "tiltShift".into(),
            distance: 70.,
            band_width: 10.,
            ..Default::default()
        };
        let mut combined = original.clone();
        let stack = Effects {
            enabled: true,
            stack: true,
            layers: vec![path.clone(), band.clone()],
            ..Default::default()
        };
        stack.validate().unwrap();
        apply(&mut combined, &stack);
        let mut manual = original.clone();
        apply(&mut manual, &path);
        apply(&mut manual, &band);
        assert_eq!(combined, manual);
        assert_ne!(combined, two);
    }
    #[test]
    fn flat_color_does_not_acquire_salt_and_pepper_and_nested_layers_are_rejected() {
        let mut d = fixture();
        d.samples = DeepSamples::F32(vec![0.2; 120 * 80 * 3]);
        let baseline = d.clone();
        let s = Effects {
            enabled: true,
            mode: "tiltShift".into(),
            dissolve: 100.,
            distance: 80.,
            ..Default::default()
        };
        apply(&mut d, &s);
        if let (DeepSamples::F32(a), DeepSamples::F32(b)) = (&d.samples, &baseline.samples) {
            assert!(a.iter().zip(b).all(|(a, b)| (a - b).abs() < 0.00001));
        }
        let nested = Effects {
            stack: true,
            layers: vec![Effects {
                stack: true,
                ..Default::default()
            }],
            ..Default::default()
        };
        assert!(nested.validate().is_err());
    }
}
