//! Destructive-free creative effects, in output-linear RGB before final encoding.
use lightcraft_pipeline::{DeepImage, DeepSamples};
use serde::{Deserialize, Serialize};
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
pub fn apply(d: &mut DeepImage, s: &Effects) {
    if !s.enabled || d.width == 0 || d.height == 0 {
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
    if s.mode != "tiltShift" {
        let steps = (distance / 2.).ceil().clamp(2., 96.) as usize;
        let mut offsets = Vec::with_capacity(steps);
        for k in 0..steps {
            let t = k as f32 / (steps - 1) as f32;
            let q = if s.mode == "path" {
                let a = 1. - t;
                [
                    a * a * p[0][0] + 2. * a * t * p[2][0] + t * t * p[1][0],
                    a * a * p[0][1] + 2. * a * t * p[2][1] + t * t * p[1][1],
                ]
            } else {
                [p[0][0] + t * dx, p[0][1] + t * dy]
            };
            offsets.push([
                (q[0] - center[0]) / length * distance,
                (q[1] - center[1]) / length * distance,
            ]);
        }
        let workers = if w * h >= 100_000 {
            std::thread::available_parallelism().map_or(1, |n| n.get().min(4))
        } else {
            1
        };
        let rows = h.div_ceil(workers);
        std::thread::scope(|scope| {
            for (chunk_index, chunk) in blurred.chunks_mut(rows * w * 3).enumerate() {
                let original = &original;
                let offsets = &offsets;
                scope.spawn(move || {
                    for (i, pixel) in chunk.chunks_exact_mut(3).enumerate() {
                        let x = i % w;
                        let y = chunk_index * rows + i / w;
                        let mut sum = [0.; 3];
                        for o in offsets {
                            let rgb = sample(original, w, h, x as f32 + o[0], y as f32 + o[1]);
                            for c in 0..3 {
                                sum[c] += rgb[c];
                            }
                        }
                        for c in 0..3 {
                            pixel[c] = sum[c] / steps as f32;
                        }
                    }
                });
            }
        });
    }
    let half = s.band_width as f32 / 100. * long * 0.4;
    let fade = (s.transition as f32 / 100. * long * 0.2).max(1.);
    let mix = s.amount as f32 / 100.;
    let sharp = s.sharpness as f32 / 100.;
    let particle = (s.particle_size as f32 / 100. * long * 0.01).max(1.);
    for y in 0..h {
        for x in 0..w {
            let mut a = mix;
            if s.mode == "tiltShift" {
                let perpendicular =
                    ((x as f32 - center[0]) * -ny + (y as f32 - center[1]) * nx).abs();
                a *= smooth(half, half + fade, perpendicular);
            }
            if s.dissolve > 0. {
                let solid = if noise((x as f32 / particle) as u32, (y as f32 / particle) as u32) < a
                {
                    1.
                } else {
                    0.
                };
                a = a * (1. - s.dissolve as f32 / 100.) + solid * s.dissolve as f32 / 100.;
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
            let i = (y * w + x) * 3;
            for c in 0..3 {
                let motion = blurred[i + c] * (1. - sharp) + original[i + c] * sharp;
                v[i + c] = original[i + c] * (1. - a) + motion * a;
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
