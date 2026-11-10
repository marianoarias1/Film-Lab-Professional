//! Explicit, validated delivery geometry; original media is never modified.
use lightcraft_pipeline::{DeepImage, DeepSamples};
use lightcraft_raster::Rgb32f;
use lightcraft_raster::resample::{Filter, resize};
use serde::{Deserialize, Serialize};
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Delivery {
    pub width: usize,
    pub height: usize,
    pub fit: String,
    pub crop_x: f64,
    pub crop_y: f64,
    pub upscale: bool,
    pub jpeg_quality: u8,
    pub fps: f64,
    pub bitrate_mbps: f64,
    pub audio_kbps: u32,
}
impl Default for Delivery {
    fn default() -> Self {
        Self {
            width: 0,
            height: 0,
            fit: "contain".into(),
            crop_x: 0.5,
            crop_y: 0.5,
            upscale: false,
            jpeg_quality: 95,
            fps: 0.,
            bitrate_mbps: 20.,
            audio_kbps: 320,
        }
    }
}
impl Delivery {
    pub fn validate(&self) -> Result<(), String> {
        if (self.width == 0) != (self.height == 0)
            || (self.width > 0 && (self.width < 16 || self.height < 16))
            || self.width > 7680
            || self.height > 7680
            || self.width * self.height > 34_000_000
            || !["contain", "cover"].contains(&self.fit.as_str())
            || [self.crop_x, self.crop_y]
                .iter()
                .any(|v| !v.is_finite() || !(0. ..=1.).contains(v))
            || !(1..=100).contains(&self.jpeg_quality)
            || !self.fps.is_finite()
            || !(self.fps == 0. || (1. ..=120.).contains(&self.fps))
            || !self.bitrate_mbps.is_finite()
            || !(1. ..=200.).contains(&self.bitrate_mbps)
            || !(64..=320).contains(&self.audio_kbps)
        {
            return Err("Parámetros de exportación inválidos (máximo 7680 px y 34 MP)".into());
        }
        Ok(())
    }
    pub fn size(&self, w: usize, h: usize, video: bool) -> (usize, usize) {
        let (mut tw, mut th) = if self.width == 0 {
            (w, h)
        } else {
            (self.width, self.height)
        };
        if !self.upscale && self.width > 0 {
            let scale = if self.fit == "cover" {
                (w as f64 / tw as f64).min(h as f64 / th as f64)
            } else {
                (w as f64 / tw as f64).max(h as f64 / th as f64)
            }
            .min(1.);
            tw = (tw as f64 * scale).round().max(1.) as usize;
            th = (th as f64 * scale).round().max(1.) as usize;
        }
        if video {
            tw = (tw / 2 * 2).max(2);
            th = (th / 2 * 2).max(2);
        }
        (tw, th)
    }
    pub fn transform(&self, mut d: DeepImage, scale: f32) -> Result<DeepImage, String> {
        if self.width == 0 {
            return Ok(d);
        }
        let (tw, th) = self.size(d.width, d.height, false);
        let tw = (tw as f32 * scale).round().max(1.) as usize;
        let th = (th as f32 * scale).round().max(1.) as usize;
        if d.width == tw && d.height == th {
            return Ok(d);
        }
        let DeepSamples::F32(rgb) = &d.samples else {
            return Err("Exportación requiere RGB float".into());
        };
        let (sw, sh, sx, sy) = if self.fit == "cover" {
            let ar = tw as f64 / th as f64;
            let sw = d.width.min((d.height as f64 * ar).round().max(1.) as usize);
            let sh = d.height.min((d.width as f64 / ar).round().max(1.) as usize);
            (
                sw,
                sh,
                ((d.width - sw) as f64 * self.crop_x).round() as usize,
                ((d.height - sh) as f64 * self.crop_y).round() as usize,
            )
        } else {
            (d.width, d.height, 0, 0)
        };
        let ratio = (tw as f64 / sw as f64).min(th as f64 / sh as f64);
        let rw = (sw as f64 * ratio).round().max(1.) as usize;
        let rh = (sh as f64 * ratio).round().max(1.) as usize;
        let mut data = Vec::with_capacity(sw * sh);
        for y in sy..sy + sh {
            for x in sx..sx + sw {
                let i = (y * d.width + x) * 3;
                data.push([rgb[i], rgb[i + 1], rgb[i + 2]]);
            }
        }
        let image = Rgb32f {
            width: sw,
            height: sh,
            data,
        };
        let resized = resize(&image, rw, rh, Filter::Lanczos3);
        let ox = ((rw as f64 - tw as f64) * self.crop_x).round() as isize;
        let oy = ((rh as f64 - th as f64) * self.crop_y).round() as isize;
        let mut out = vec![0.; tw * th * 3];
        for y in 0..th {
            for x in 0..tw {
                let sx = x as isize + ox;
                let sy = y as isize + oy;
                if sx >= 0 && sy >= 0 && (sx as usize) < rw && (sy as usize) < rh {
                    out[(y * tw + x) * 3..(y * tw + x) * 3 + 3]
                        .copy_from_slice(&resized.data[sy as usize * rw + sx as usize]);
                }
            }
        }
        d.width = tw;
        d.height = th;
        d.samples = DeepSamples::F32(out);
        Ok(d)
    }
    pub fn configure_video(&self, s: &mut filmcraft_export::ExportSettings) {
        s.bitrate_kbps = (self.bitrate_mbps * 1000.).round() as u32;
        s.max_bitrate_kbps = Some((self.bitrate_mbps * 1500.).round() as u32);
        s.adaptive_bitrate = None;
        s.bitrate_mode = filmcraft_export::BitrateMode::Vbr1Pass;
        s.audio.bitrate_kbps = self.audio_kbps;
        if self.fps > 0. {
            s.frame_rate = Some(filmcraft_time::FrameRate::new(
                (self.fps * 1000.).round() as i64,
                1000,
            ));
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn respects_aspect_ratio_and_no_upscale() {
        let mut d = Delivery {
            width: 1080,
            height: 1920,
            fit: "cover".into(),
            ..Default::default()
        };
        assert_eq!(d.size(640, 360, true), (202, 360));
        d.upscale = true;
        assert_eq!(d.size(640, 360, true), (1080, 1920));
        d.width = usize::MAX;
        assert!(d.validate().is_err());
    }
    #[test]
    fn rejects_nonfinite_and_incomplete_targets() {
        let mut d = Delivery::default();
        d.width = 1080;
        assert!(d.validate().is_err());
        d.width = 0;
        d.fps = f64::NAN;
        assert!(d.validate().is_err());
    }
}
