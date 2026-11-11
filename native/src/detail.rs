//! A bounded, native-pixel inspection window. Creative post-effects deliberately
//! stay in the main viewer; the technical comparison isolates global detail.
use super::{Result, Settings, png};
use lightcraft_pipeline::{PixelWindow, RenderRequest, SourceInfo, StageCache};
use lightcraft_raster::Rgb32f;
use serde_json::{Value, json};
use std::sync::Arc;

pub struct Input {
    pub key: String,
    pub time_bits: u64,
    pub pixels: Arc<Rgb32f>,
    pub info: SourceInfo,
    pub cache: StageCache,
    pub before_cache: StageCache,
}

fn axis(center: f64, full: usize, size: usize) -> usize {
    (center * full as f64 - size as f64 * 0.5)
        .round()
        .clamp(0., full.saturating_sub(size) as f64) as usize
}

pub fn render(input: &Input, settings: &Settings, r: &Value) -> Result<Value> {
    let center = |key| {
        let value = r[key].as_f64().ok_or("Falta el centro del recorte")?;
        if !value.is_finite() || !(0. ..=1.).contains(&value) {
            return Err("Centro de detalle inválido");
        }
        Ok(value)
    };
    let dimension = |key| {
        let n = r[key].as_u64().ok_or("Falta el tamaño del recorte")?;
        if !(1..=1024).contains(&n) {
            return Err("Tamaño de detalle inválido");
        }
        Ok(n as usize)
    };
    let (fw, fh) = (input.pixels.width, input.pixels.height);
    if fw == 0 || fh == 0 {
        return Err("Imagen sin dimensiones".into());
    }
    let (w, h) = (dimension("width")?.min(fw), dimension("height")?.min(fh));
    let (x, y) = (axis(center("x")?, fw, w), axis(center("y")?, fh, h));
    let halo = (fw.max(fh) / 30).clamp(64, 512);
    let (left, top) = (x.saturating_sub(halo), y.saturating_sub(halo));
    let work = PixelWindow {
        x: left,
        y: top,
        w: (x + w + halo).min(fw) - left,
        h: (y + h + halo).min(fh) - top,
    };
    let mut request = RenderRequest::fit(fw, fh);
    request.window = Some(work);
    let mut before = settings.clone();
    before.sharpness = 0.;
    before.denoise = 0.;
    before.denoise_color = Some(0.);
    let run = |s: &Settings, cache| {
        lightcraft_pipeline::render_cached(
            &input.pixels,
            &input.info,
            &s.develop(&input.info),
            &request,
            cache,
        )
        .image
        .crop(x - left, y - top, w, h)
    };
    let after = run(settings, &input.cache);
    let before = run(&before, &input.before_cache);
    std::fs::write(r["output"].as_str().ok_or("Falta salida")?, png(&after)?)
        .map_err(|e| e.to_string())?;
    std::fs::write(
        r["beforeOutput"]
            .as_str()
            .ok_or("Falta salida de comparación")?,
        png(&before)?,
    )
    .map_err(|e| e.to_string())?;
    Ok(json!({"x":x,"y":y,"width":w,"height":h,"fullWidth":fw,"fullHeight":fh}))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn inspection_centers_are_bounded_in_native_pixels() {
        assert_eq!(axis(0., 6000, 320), 0);
        assert_eq!(axis(0.5, 6000, 320), 2840);
        assert_eq!(axis(1., 6000, 320), 5680);
        assert_eq!(axis(1., 12, 12), 0);
    }
}

#[cfg(test)]
mod quality_tests {
    use super::*;
    use lightcraft_pipeline::{OutputDepth, render};
    #[test]
    fn legacy_raw_color_reduction_is_preserved_until_explicitly_changed() {
        let raw = SourceInfo {
            raw: true,
            ..Default::default()
        };
        let jpeg = SourceInfo::default();
        assert_eq!(Settings::default().develop(&raw).detail.nr_color, 25.);
        assert_eq!(Settings::default().develop(&jpeg).detail.nr_color, 0.);
        assert_eq!(
            Settings {
                denoise_color: Some(0.),
                ..Default::default()
            }
            .develop(&raw)
            .detail
            .nr_color,
            0.
        );
    }

    #[test]
    fn radius_masking_and_color_reduction_change_real_pixels() {
        let mut image = Rgb32f::new(128, 96);
        for y in 0..image.height {
            for x in 0..image.width {
                let luma = if x < 64 { 0.2 } else { 0.6 };
                let n = ((x * 31 + y * 17) % 13) as f32 * 0.005;
                image.data[y * image.width + x] = [luma + n, luma, luma - n];
            }
        }
        let info = SourceInfo {
            native_long: Some(128),
            ..Default::default()
        };
        let settings = Settings {
            sharpness: 90.,
            sharpen_radius: 0.6,
            ..Default::default()
        };
        let mut request = RenderRequest::fit(128, 96);
        request.depth = OutputDepth::F32Linear;
        let draw = |s: &Settings| {
            render(&image, &info, &s.develop(&info), &request)
                .image
                .data
        };
        let small = draw(&settings);
        assert_ne!(
            small,
            draw(&Settings {
                sharpen_radius: 2.5,
                ..settings.clone()
            })
        );
        assert_ne!(
            small,
            draw(&Settings {
                sharpen_masking: 100.,
                ..settings.clone()
            })
        );
        assert_ne!(
            draw(&Settings::default()),
            draw(&Settings {
                denoise_color: Some(80.),
                ..Default::default()
            })
        );
        assert_ne!(
            draw(&Settings {
                denoise: 80.,
                denoise_detail: 0.,
                ..Default::default()
            }),
            draw(&Settings {
                denoise: 80.,
                denoise_detail: 100.,
                ..Default::default()
            })
        );
        let mut invalid = settings.clone();
        invalid.sharpen_radius = 3.1;
        assert!(invalid.validate().is_err());
        invalid.sharpen_radius = 1.;
        invalid.denoise_color = Some(-1.);
        assert!(invalid.validate().is_err());
    }
}
