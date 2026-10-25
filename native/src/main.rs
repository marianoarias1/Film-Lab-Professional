mod export_diagnostics;
use filmcraft_frame::{AudioBuffer, VideoFrame};
use filmcraft_media::{FrameRequest, MediaInfo, MediaSource, SharedSource};
use filmcraft_project::{
    Interpretation, ItemKind, Label, MediaClip, MediaRef, Project, SequenceSettings, TrackKind,
};
use filmcraft_time::{Tick, TimeRange};
use lightcraft_develop::{DevelopSettings, Treatment, WbMode};
use lightcraft_pipeline::{DeepSamples, OutputDepth, RenderRequest, SourceInfo, StageCache};
use lightcraft_raster::Rgb32f;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    io::{self, BufRead, Write},
    path::Path,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, AtomicU64, Ordering},
    },
    time::Instant,
};

type Result<T> = std::result::Result<T, String>;
const ENGINE: &str = "filmlab-pro-0.5-lc-d999e382-fc-6c3948a3";
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
struct Settings {
    exposure: f64,
    contrast: f64,
    highlights: f64,
    shadows: f64,
    whites: f64,
    blacks: f64,
    temperature: f64,
    tint: f64,
    saturation: f64,
    vibrance: f64,
    texture: f64,
    clarity: f64,
    dehaze: f64,
    grain: f64,
    grain_size: f64,
    masks: Vec<lightcraft_develop::Mask>,
    hsl: [[f64; 3]; 8],
    sharpness: f64,
    denoise: f64,
    vignette: f64,
    mono: bool,
    curve: Vec<[f64; 2]>,
    light_leak: f64,
    leak_x: f64,
    leak_y: f64,
    leak_size: f64,
    leak_temperature: f64,
    shadow_hue: f64,
    shadow_amount: f64,
    highlight_hue: f64,
    highlight_amount: f64,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            exposure: 0.,
            contrast: 0.,
            highlights: 0.,
            shadows: 0.,
            whites: 0.,
            blacks: 0.,
            temperature: 0.,
            tint: 0.,
            saturation: 0.,
            vibrance: 0.,
            texture: 0.,
            clarity: 0.,
            dehaze: 0.,
            grain: 0.,
            grain_size: 25.,
            masks: Vec::new(),
            hsl: [[0.; 3]; 8],
            sharpness: 0.,
            denoise: 0.,
            vignette: 0.,
            mono: false,
            curve: vec![],
            light_leak: 0.,
            leak_x: 0.2,
            leak_y: 0.3,
            leak_size: 0.4,
            leak_temperature: 60.,
            shadow_hue: 220.,
            shadow_amount: 0.,
            highlight_hue: 40.,
            highlight_amount: 0.,
        }
    }
}
impl Settings {
    fn validate(&self) -> Result<()> {
        if self.masks.len() > 32 {
            return Err("Máximo 32 máscaras por archivo".into());
        }
        for m in &self.masks {
            if m.components.len() != 1 || m.name.len() > 160 {
                return Err("Máscara inválida".into());
            }
            let a = &m.adjust;
            if [
                a.amount,
                a.hue,
                a.color_hue,
                a.color_sat,
                a.sharpness,
                a.noise,
                a.moire,
                a.defringe,
                m.refine,
            ]
            .iter()
            .any(|v| !v.is_finite() || v.abs() > 360.)
            {
                return Err("Parámetros locales fuera de rango".into());
            }

            if !(-5. ..=5.).contains(&a.exposure)
                || [
                    a.temp,
                    a.tint,
                    a.contrast,
                    a.highlights,
                    a.shadows,
                    a.whites,
                    a.blacks,
                    a.texture,
                    a.clarity,
                    a.dehaze,
                    a.saturation,
                ]
                .iter()
                .any(|v| !v.is_finite() || !(-100. ..=100.).contains(v))
            {
                return Err("Ajuste local inválido".into());
            }
            let unit = |v: f64| v.is_finite() && (0. ..=1.).contains(&v);
            match &m.components[0].shape {
                lightcraft_develop::MaskShape::Radial {
                    center,
                    rx,
                    ry,
                    angle,
                    feather,
                    ..
                } => {
                    if !unit(center.x)
                        || !unit(center.y)
                        || !(*rx >= 0.01 && *rx <= 2.)
                        || !(*ry >= 0.01 && *ry <= 2.)
                        || !angle.is_finite()
                        || !(-180. ..=180.).contains(angle)
                        || !(0. ..=100.).contains(feather)
                    {
                        return Err("Geometría radial inválida".into());
                    }
                }
                lightcraft_develop::MaskShape::Linear { start, end } => {
                    if !unit(start.x)
                        || !unit(start.y)
                        || !unit(end.x)
                        || !unit(end.y)
                        || (start.x - end.x).abs() + (start.y - end.y).abs() < 0.001
                    {
                        return Err("El degradado necesita dos puntos distintos".into());
                    }
                }
                lightcraft_develop::MaskShape::LuminanceRange {
                    lo,
                    hi,
                    lo_feather,
                    hi_feather,
                } => {
                    if !unit(*lo)
                        || !unit(*hi)
                        || lo > hi
                        || !unit(*lo_feather)
                        || !unit(*hi_feather)
                    {
                        return Err("Rango de luminancia inválido".into());
                    }
                }
                lightcraft_develop::MaskShape::Brush { strokes } => {
                    if strokes.len() > 128
                        || strokes.iter().map(|s| s.points.len()).sum::<usize>() > 10000
                        || strokes.iter().any(|s| {
                            s.points.iter().any(|p| !unit(p.x) || !unit(p.y))
                                || !(0.001..=1.).contains(&s.size)
                                || !(0. ..=100.).contains(&s.feather)
                                || !(0. ..=100.).contains(&s.flow)
                                || !(0. ..=100.).contains(&s.density)
                        })
                    {
                        return Err("Pincel inválido o demasiado extenso".into());
                    }
                }
                _ => return Err("Tipo de máscara no admitido en esta versión".into()),
            }
        }
        let value = serde_json::to_value(self).map_err(|e| e.to_string())?;
        for (k, v) in value.as_object().ok_or("Invalid settings")? {
            if let Some(n) = v.as_f64() {
                let (min, max) = match k.as_str() {
                    "exposure" => (-5., 5.),
                    "leakX" | "leakY" => (0., 1.),
                    "leakSize" => (0.05, 1.),
                    "shadowHue" | "highlightHue" => (0., 360.),
                    "grain" | "sharpness" | "denoise" | "lightLeak" | "shadowAmount"
                    | "highlightAmount" => (0., 100.),
                    _ => (-100., 100.),
                };
                if !n.is_finite() || n < min || n > max {
                    return Err(format!("Valor inválido: {k}"));
                }
            }
        }
        if self
            .hsl
            .iter()
            .flatten()
            .any(|v| !v.is_finite() || !(-100. ..=100.).contains(v))
            || !(0. ..=100.).contains(&self.grain_size)
        {
            return Err("Mezclador o tamaño de grano inválido".into());
        }
        if self.curve.len() > 32
            || self
                .curve
                .iter()
                .any(|p| p.iter().any(|v| !v.is_finite() || *v < 0. || *v > 1.))
            || self.curve.windows(2).any(|p| p[0][0] >= p[1][0])
        {
            return Err("Curva inválida".into());
        }
        Ok(())
    }
    fn develop(&self, info: &SourceInfo) -> DevelopSettings {
        let mut d = if info.raw {
            DevelopSettings::for_raw(info.as_shot_temp, info.as_shot_tint)
        } else {
            DevelopSettings::default()
        };
        d.masks = self.masks.clone();
        d.light.exposure = self.exposure;
        d.light.contrast = self.contrast;
        d.light.highlights = self.highlights;
        d.light.shadows = self.shadows;
        d.light.whites = self.whites;
        d.light.blacks = self.blacks;
        if self.temperature != 0. || self.tint != 0. {
            d.wb.mode = WbMode::Custom;
            d.wb.scale = lightcraft_develop::WbScale::Kelvin;
            d.wb.temp =
                (info.as_shot_temp * 2f64.powf(self.temperature / 100.)).clamp(2000., 50000.);
            d.wb.tint = info.as_shot_tint + self.tint;
        }
        d.color.saturation = self.saturation;
        d.color.vibrance = self.vibrance;
        d.effects.clarity = self.clarity;
        d.effects.texture = self.texture;
        d.effects.dehaze = self.dehaze;
        d.grain.amount = self.grain;
        d.grain.size = self.grain_size;
        let bands = self.hsl.map(|v| lightcraft_develop::Hsl {
            hue: v[0],
            sat: v[1],
            lum: v[2],
        });
        d.mixer = lightcraft_develop::Mixer {
            red: bands[0],
            orange: bands[1],
            yellow: bands[2],
            green: bands[3],
            aqua: bands[4],
            blue: bands[5],
            purple: bands[6],
            magenta: bands[7],
        };
        d.detail.sharpen_amount = self.sharpness;
        d.detail.nr_luminance = self.denoise;
        d.vignette.amount = -self.vignette;
        if self.mono {
            d.treatment = Treatment::Bw;
        }
        d.curve.master = self
            .curve
            .iter()
            .map(|p| lightcraft_geom::Point { x: p[0], y: p[1] })
            .collect();
        d.grading.shadows.hue = self.shadow_hue;
        d.grading.shadows.sat = self.shadow_amount;
        d.grading.highlights.hue = self.highlight_hue;
        d.grading.highlights.sat = self.highlight_amount;
        d
    }
}
struct Photo {
    pixels: Arc<Rgb32f>,
    info: SourceInfo,
    cache: StageCache,
    draft_cache: StageCache,
    width: usize,
    height: usize,
    warnings: Vec<String>,
}
struct VideoPreviewInput {
    key: String,
    time_bits: u64,
    edge: usize,
    draft: bool,
    pixels: Arc<Rgb32f>,
    cache: StageCache,
}
impl VideoPreviewInput {
    fn matches(&self, key: &str, time: f64, edge: usize, draft: bool) -> bool {
        self.key == key
            && self.time_bits == time.to_bits()
            && self.edge == edge
            && self.draft == draft
    }
}
enum Source {
    Photo(Photo),
    Video(SharedSource),
}
#[derive(Default)]
struct State {
    sources: HashMap<String, Source>,
    video_previews: Vec<VideoPreviewInput>,
}
fn resize(img: Rgb32f, edge: usize) -> Rgb32f {
    let long = img.width.max(img.height);
    if long <= edge {
        return img;
    }
    let k = edge as f64 / long as f64;
    let (w, h) = (
        (img.width as f64 * k).round().max(1.) as usize,
        (img.height as f64 * k).round().max(1.) as usize,
    );
    lightcraft_raster::resample::resize(&img, w, h, lightcraft_raster::resample::Filter::Mitchell)
}
fn photo(path: &str, edge: usize) -> Result<Photo> {
    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
    if lightcraft_raw::probe(&bytes).is_some() {
        let mut raw =
            lightcraft_raw::decode(&bytes).map_err(|e| format!("RAW no compatible: {e}"))?;
        if !lightcraft_raw::color::has_matrix(&raw.color) {
            if let Some(camera) = raw.metadata.model.as_deref().and_then(|model| {
                lightcraft_raw::spectral::find(raw.metadata.make.as_deref(), model)
            }) {
                camera.fill(&mut raw.color);
            }
        }
        let native = raw.info().developed_size();
        if native.0.saturating_mul(native.1) > 100_000_000 {
            return Err("La prueba admite hasta 100 MP por fotografía.".into());
        }
        let white = lightcraft_raw::color::as_shot_white_xy(&raw);
        let transform = lightcraft_raw::color::camera_transform(&raw, white);
        let mut img = if edge < usize::MAX {
            let factor = [8, 6, 4, 3, 2]
                .into_iter()
                .find(|k| raw.can_bin(*k) && native.0.max(native.1) / k >= edge);
            if let Some(k) = factor {
                match raw.develop_binned(k, 0.98).map_err(|e| e.to_string())? {
                    Some(img) => img,
                    None => raw
                        .develop(lightcraft_raw::Method::Ahd)
                        .map_err(|e| e.to_string())?,
                }
            } else {
                raw.develop(lightcraft_raw::Method::Ahd)
                    .map_err(|e| e.to_string())?
            }
        } else {
            raw.develop(lightcraft_raw::Method::Ahd)
                .map_err(|e| e.to_string())?
        };
        lightcraft_raw::highlight::reconstruct(&mut img, transform.wb, 0.98);
        for p in &mut img.data {
            for i in 0..3 {
                p[i] *= transform.wb[i];
            }
            *p = transform.matrix.apply_f32(*p);
            for c in p {
                *c *= 2f32.powf(transform.baseline_exposure as f32);
            }
        }
        let orientation = raw.orientation;
        let oriented = img.into_oriented(orientation);
        let dims = if matches!(orientation.to_parts().1, 1 | 3) {
            (native.1, native.0)
        } else {
            native
        };
        let img = resize(oriented, edge);
        let (temp, tint) = lightcraft_color::cct::xy_to_temp_tint(white);
        let mut warnings = Vec::new();
        if transform.matrix_is_fallback {
            warnings.push("Sin perfil medido para esta cámara: color aproximado; validar antes de uso profesional.".into());
        }
        let info = SourceInfo {
            raw: true,
            as_shot_temp: temp,
            as_shot_tint: tint,
            relative_wb: transform.matrix_is_fallback,
            camera_color: (!transform.matrix_is_fallback).then(|| {
                Arc::new(lightcraft_pipeline::CameraColor {
                    tags: raw.color.clone(),
                    developed_for: white,
                })
            }),
            native_long: Some(native.0.max(native.1)),
            ..Default::default()
        };
        Ok(Photo {
            pixels: Arc::new(img),
            info,
            cache: StageCache::default(),
            draft_cache: StageCache::default(),
            width: dims.0,
            height: dims.1,
            warnings,
        })
    } else {
        let decoded = lightcraft_codecs::decode(
            &bytes,
            lightcraft_codecs::DecodeOptions {
                max_pixels: 100_000_000,
                ..Default::default()
            },
        )
        .map_err(|e| e.to_string())?;
        if decoded.has_alpha {
            return Err("Esta prueba admite fotografías opacas. Convertí el archivo con transparencia antes de importarlo.".into());
        }
        let img = decoded
            .to_working()
            .into_oriented(lightcraft_geom::Orientation::from_exif(decoded.orientation));
        let (w, h) = (img.width, img.height);
        Ok(Photo {
            pixels: Arc::new(resize(img, edge)),
            info: SourceInfo::default(),
            cache: StageCache::default(),
            draft_cache: StageCache::default(),
            width: w,
            height: h,
            warnings: vec![],
        })
    }
}
fn video_open(path: &str) -> Result<SharedSource> {
    {
        let reader = filmcraft_media::reader::FileReader::open(Path::new(path))
            .map_err(|e| e.to_string())?;
        filmcraft_media::reader::open_reader(
            path,
            Arc::new(reader),
            &filmcraft_codecs::reader_openers(),
            &filmcraft_codecs::openers(),
        )
    }
    .map_err(|e| e.to_string())
}
fn video_rgb_timed(
    src: &SharedSource,
    time: f64,
    edge: usize,
    metrics: Option<&export_diagnostics::Metrics>,
) -> Result<Rgb32f> {
    let decode_start = Instant::now();
    let f = src
        .video_frame(FrameRequest {
            time: Tick::from_seconds_f64(time),
            scale: (edge as f32
                / src
                    .info()
                    .video
                    .as_ref()
                    .map_or(1, |v| v.width.max(v.height)) as f32)
                .min(1.),
        })
        .map_err(|e| e.to_string())?;
    if let Some(m) = metrics {
        export_diagnostics::record(&m.decode_ns, decode_start);
    }
    let input_start = Instant::now();
    // FilmCraft normalizes the video's transfer curve, primaries and HDR metadata before our common grade.
    let mut project = Project::new("Input");
    let id = project.add_item(
        "Source",
        Label::Forest,
        ItemKind::Media(MediaClip {
            media: MediaRef::File {
                path: String::new(),
            },
            info: src.info().clone(),
            interpret: Interpretation::default(),
            mark_in: None,
            mark_out: None,
            markers: vec![],
            offline: false,
            proxy: None,
            identity: None,
        }),
        None,
    );
    let n = (f.width.max(f.height) as usize / edge.max(1)).max(1);
    let image = filmcraft_render::colorman::decode(
        &project,
        id,
        &f,
        n,
        &filmcraft_color::ColorPipeline::REC709,
    );
    let m = lightcraft_color::SRGB.to_space(&lightcraft_color::REC2020);
    let img = Rgb32f {
        width: image.w,
        height: image.h,
        data: image
            .px
            .chunks_exact(4)
            .map(|p| m.apply_f32([p[0], p[1], p[2]]))
            .collect(),
    };
    let result = resize(img, edge);
    if let Some(m) = metrics {
        export_diagnostics::record(&m.input_ns, input_start);
    }
    Ok(result)
}
#[cfg(test)]
fn render(
    pixels: &Arc<Rgb32f>,
    info: &SourceInfo,
    cache: &StageCache,
    s: &Settings,
    edge: usize,
    deep: OutputDepth,
) -> lightcraft_pipeline::Rendered {
    render_quality(pixels, info, cache, s, edge, deep, false)
}
fn render_quality(
    pixels: &Arc<Rgb32f>,
    info: &SourceInfo,
    cache: &StageCache,
    s: &Settings,
    edge: usize,
    deep: OutputDepth,
    draft: bool,
) -> lightcraft_pipeline::Rendered {
    let mut req = RenderRequest::fit(edge, edge);
    req.quality = if draft {
        lightcraft_pipeline::Quality::Draft
    } else {
        lightcraft_pipeline::Quality::Full
    };
    req.depth = deep;
    let mut r = lightcraft_pipeline::render_cached(pixels, info, &s.develop(info), &req, cache);
    if s.light_leak > 0. {
        if let Some(deep) = r.deep.as_mut() {
            apply_leak(deep, s);
            r.image = deep.to_rgba8();
        }
    }
    r
}
fn apply_leak(d: &mut lightcraft_pipeline::DeepImage, s: &Settings) {
    if s.light_leak <= 0. {
        return;
    }
    if let DeepSamples::F32(v) = &mut d.samples {
        let size = s.leak_size as f32;
        let t = (s.leak_temperature as f32 + 100.) / 200.;
        let color = [0.3 + 0.7 * t, 0.33, 1. - 0.9 * t];
        for y in 0..d.height {
            for x in 0..d.width {
                let dx = x as f32 / d.width as f32 - s.leak_x as f32;
                let dy = (y as f32 / d.height as f32 - s.leak_y as f32) * d.height as f32
                    / d.width as f32;
                let g = (-(dx * dx + dy * dy) / (size * size * 0.25)).exp() * s.light_leak as f32
                    / 100.
                    * 0.5;
                for c in 0..3 {
                    let i = (y * d.width + x) * 3 + c;
                    v[i] = (v[i] + color[c] * g).clamp(0., 1.);
                }
            }
        }
    }
}
fn render_export(
    pixels: &Arc<Rgb32f>,
    info: &SourceInfo,
    cache: &StageCache,
    s: &Settings,
    edge: usize,
) -> Result<lightcraft_pipeline::DeepImage> {
    let mut request = RenderRequest::fit(edge, edge);
    request.depth = OutputDepth::F32Linear;
    let mut deep =
        lightcraft_pipeline::render_deep_cached(pixels, info, &s.develop(info), &request, cache)
            .ok_or("Sin salida de alta precisión")?;
    apply_leak(&mut deep, s);
    Ok(deep)
}

fn png(r: &lightcraft_raster::Rgba8) -> Result<Vec<u8>> {
    lightcraft_codecs::encode_png(
        &lightcraft_codecs::EncodeImage::rgba8(r),
        &lightcraft_codecs::EncodeMeta::default(),
    )
    .map_err(|e| e.to_string())
}
struct Graded {
    metrics: Arc<export_diagnostics::Metrics>,
    src: SharedSource,
    settings: Settings,
    info: MediaInfo,
}
impl MediaSource for Graded {
    fn info(&self) -> &MediaInfo {
        &self.info
    }
    fn video_frame(&self, req: FrameRequest) -> filmcraft_media::Result<Arc<VideoFrame>> {
        let edge = (self
            .info
            .video
            .as_ref()
            .map_or(1, |v| v.width.max(v.height)) as f32
            * req.scale)
            .round()
            .max(1.) as usize;
        let img = video_rgb_timed(&self.src, req.time.seconds(), edge, Some(&self.metrics))
            .map_err(filmcraft_media::MediaError::Decode)?;
        self.metrics.calls.fetch_add(1, Ordering::Relaxed);
        let grade_start = Instant::now();
        let deep = render_export(
            &Arc::new(img),
            &SourceInfo::default(),
            &StageCache::default(),
            &self.settings,
            edge,
        )
        .map_err(filmcraft_media::MediaError::Decode)?;
        export_diagnostics::record(&self.metrics.grade_ns, grade_start);
        let packing_start = Instant::now();
        let DeepSamples::F32(rgb) = deep.samples else {
            return Err(filmcraft_media::MediaError::Decode(
                "Profundidad inválida".into(),
            ));
        };
        let rgba = rgb
            .chunks_exact(3)
            .flat_map(|p| [p[0], p[1], p[2], 1.])
            .collect();
        export_diagnostics::record(&self.metrics.packing_ns, packing_start);
        Ok(Arc::new(
            VideoFrame::rgba_f32(deep.width as u32, deep.height as u32, rgba).with_pts(req.time),
        ))
    }
    fn audio(&self, start: i64, frames: usize, rate: u32) -> filmcraft_media::Result<AudioBuffer> {
        self.src.audio(start, frames, rate)
    }
}
fn export_video(
    src: &SharedSource,
    settings: Settings,
    out: &str,
    proxy: bool,
    encoding: &str,
    id: u64,
    writer: Arc<Mutex<io::Stdout>>,
    cancel: Arc<AtomicBool>,
) -> Result<Value> {
    let export_start = Instant::now();
    let stages_before = export_diagnostics::stages();
    let hardware_before = filmcraft_export::hw_encode_stats();
    export_diagnostics::clear_last();
    export_diagnostics::clear_decline();
    let metrics = Arc::new(export_diagnostics::Metrics::default());
    let mut p = Project::new("Film Lab Professional");
    let info = src.info();
    let v = info.video.as_ref().ok_or("Sin video")?;
    if info.duration <= Tick::ZERO {
        return Err("Duración inválida".into());
    }
    let media = p.add_item(
        &info.name,
        Label::Forest,
        ItemKind::Media(MediaClip {
            media: MediaRef::File {
                path: String::new(),
            },
            info: info.clone(),
            interpret: Interpretation::default(),
            mark_in: None,
            mark_out: None,
            markers: vec![],
            offline: false,
            proxy: None,
            identity: None,
        }),
        None,
    );
    let seq = p.new_sequence(
        "Export",
        SequenceSettings {
            width: v.width,
            height: v.height,
            frame_rate: v.frame_rate,
            par: v.par,
            ..Default::default()
        },
        1,
        1,
        None,
    );
    let span = TimeRange {
        start: Tick::ZERO,
        duration: info.duration,
    };
    let clip = p
        .make_track_item(media, TrackKind::Video, Tick::ZERO, span, v.frame_rate)
        .ok_or("No se pudo crear clip")?;
    p.sequence_mut(seq).ok_or("No sequence")?.video_tracks[0]
        .items
        .push(clip);
    if info.has_audio() {
        let clip = p
            .make_track_item(media, TrackKind::Audio, Tick::ZERO, span, v.frame_rate)
            .ok_or("Audio inválido")?;
        p.sequence_mut(seq).ok_or("No sequence")?.audio_tracks[0]
            .items
            .push(clip);
    }
    let graded: SharedSource = Arc::new(Graded {
        metrics: metrics.clone(),
        src: src.clone(),
        settings,
        info: info.clone(),
    });
    let sources = filmcraft_render::SourceMap(HashMap::from([(media, graded)]));
    let scale = if proxy {
        (960. / v.width.max(v.height) as f32).min(1.)
    } else {
        1.
    };
    let requested = encoding.to_string();
    let mut mode = requested.clone();
    let mut retry_reason = None;
    let mut attempts = Vec::new();
    let mut final_report = None;
    let mut final_error = None;
    for attempt in 0..2 {
        if cancel.load(Ordering::Relaxed) {
            final_error = Some("Exportación cancelada".to_string());
            break;
        }
        let attempt_start = Instant::now();
        let attempt_stages = export_diagnostics::stages();
        let attempt_hardware = filmcraft_export::hw_encode_stats();
        let progress = Arc::new(filmcraft_export::Progress::default());
        let done = Arc::new(AtomicBool::new(false));
        let monitor_done = done.clone();
        let monitor_progress = progress.clone();
        let monitor_cancel = cancel.clone();
        let monitor_writer = writer.clone();
        let monitor_mode = mode.clone();
        let monitor_reason = retry_reason.clone();
        let media_fps = v.frame_rate.num as f64 / v.frame_rate.den.max(1) as f64;
        let monitor = std::thread::spawn(move || {
            while !monitor_done.load(Ordering::Relaxed) {
                if monitor_cancel.load(Ordering::Relaxed) {
                    monitor_progress.cancel.store(true, Ordering::Relaxed);
                }
                let frames = monitor_progress.done.load(Ordering::Relaxed);
                let total = monitor_progress.total.load(Ordering::Relaxed);
                let elapsed = attempt_start.elapsed().as_secs_f64();
                let finished_frames = total > 0 && frames >= total;
                let fps = if elapsed >= 1. && frames > 0 {
                    Some(frames as f64 / elapsed)
                } else {
                    None
                };
                let eta = if finished_frames {
                    None
                } else {
                    monitor_progress.eta().map(|d| d.as_secs_f64())
                };
                let phase = if finished_frames {
                    "finalizing"
                } else if total == 0 || frames == 0 {
                    "preparing"
                } else {
                    "processing"
                };
                send(
                    &monitor_writer,
                    json!({"event":"progress","id":id,
                    "fraction":monitor_progress.fraction().min(0.99),"frames":frames,"totalFrames":total,
                    "fps":fps,"realtimeSpeed":fps.map(|f|f/media_fps),"elapsedSeconds":export_start.elapsed().as_secs_f64(),
                    "etaSeconds":eta,"phase":phase,"attempt":attempt+1,
                    "encoder":export_diagnostics::encoder_name(&monitor_mode,&attempt_hardware),
                    "fallbackReason":monitor_reason.clone().or_else(export_diagnostics::decline)}),
                );
                std::thread::sleep(std::time::Duration::from_millis(200));
            }
        });
        let attempt_result = filmcraft_export::export(
            &Arc::new(p.clone()),
            seq,
            &export_diagnostics::settings(&mode, out, scale),
            &sources,
            &progress,
        );
        done.store(true, Ordering::Relaxed);
        let _ = monitor.join();
        let hw_now = filmcraft_export::hw_encode_stats();
        let hardware_used = hw_now.sessions > attempt_hardware.sessions;
        let attempt_error = attempt_result.as_ref().err().map(|e| e.to_string());
        attempts.push(json!({"number":attempt+1,"requested":mode,"actualEncoder":if hardware_used {"NVENC"}else{"CPU"},
            "elapsedMs":attempt_start.elapsed().as_secs_f64()*1000.,"upstreamStagesMs":export_diagnostics::stage_delta(&attempt_stages),
            "hardwareFrames":hw_now.frames.saturating_sub(attempt_hardware.frames),"error":attempt_error}));
        match attempt_result {
            Ok(report) => {
                final_report = Some(report);
                break;
            }
            Err(error) => {
                if export_diagnostics::should_retry(
                    &requested,
                    attempt,
                    hardware_used,
                    cancel.load(Ordering::Relaxed),
                ) {
                    // An encoder cannot switch streams mid-file. Discard its partial output and
                    // restart the whole export once with the original software encoder settings.
                    let _ = std::fs::remove_file(out);
                    mode = "cpu".into();
                    retry_reason = Some(format!(
                        "NVENC no pudo finalizar; se reinició con CPU. {}",
                        error.to_string().chars().take(500).collect::<String>()
                    ));
                    send(
                        &writer,
                        json!({"event":"progress","id":id,"fraction":0.,"phase":"retry","encoder":"CPU","fallbackReason":retry_reason,"attempt":2}),
                    );
                } else {
                    final_error = Some(error.to_string());
                    break;
                }
            }
        }
    }
    let elapsed = export_start.elapsed().as_secs_f64();
    let hw_now = filmcraft_export::hw_encode_stats();
    let actual = if let Some(a) = attempts.last() {
        a["actualEncoder"].as_str().unwrap_or("CPU")
    } else {
        "CPU"
    };
    let diagnostics = json!({"schemaVersion":1,"appVersion":"0.4.0","engine":ENGINE,
        "status":if final_report.is_some(){"completed"}else if cancel.load(Ordering::Relaxed){"cancelled"}else{"failed"},
        "source":{"width":v.width,"height":v.height,"frameRate":v.frame_rate,"durationSeconds":info.duration.seconds(),"hasAudio":info.has_audio()},
        "precision":"float32","effectsBackend":"CPU","displayPreviewGenerated":false,"histogramGenerated":false,"requestedEncoding":requested,"actualEncoder":actual,
        "fallbackReason":retry_reason.or_else(export_diagnostics::decline),"wallMs":elapsed*1000.,
        "frames":final_report.as_ref().map(|r|r.frames),"averageFps":final_report.as_ref().map(|r|r.frames as f64 / elapsed.max(0.001)),
        "hardwareFrames":hw_now.frames.saturating_sub(hardware_before.frames),"attempts":attempts,
        "frameProcessing":metrics.json(),"upstreamStagesMs":export_diagnostics::stage_delta(&stages_before),
        "timingNote":"Etapas y tareas paralelas pueden superponerse. Convert es parte de Encode; Wait no debe sumarse como trabajo adicional.",
        "error":final_error});
    export_diagnostics::save_last(diagnostics.clone());
    if let Some(error) = final_error {
        return Err(error);
    }
    if final_report.is_none() {
        return Err("Exportación cancelada".into());
    }
    Ok(json!({"path":out,"engine":ENGINE,"diagnostics":diagnostics}))
}
fn send(out: &Arc<Mutex<io::Stdout>>, value: Value) {
    if let Ok(mut w) = out.lock() {
        let _ = writeln!(w, "{value}");
        let _ = w.flush();
    }
}
fn run(
    state: &mut State,
    r: &Value,
    out: Arc<Mutex<io::Stdout>>,
    cancel: Arc<AtomicBool>,
) -> Result<Value> {
    let id = r["id"].as_u64().unwrap_or(0);
    let op = r["op"].as_str().ok_or("Missing op")?;
    let key = r["key"].as_str().unwrap_or("");
    if op == "hello" {
        return Ok(
            json!({"engine":ENGINE,"lightcraft":"d999e382bafbb5d5c54482fdb1d11f6a63bfdf69","filmcraft":"6c3948a36c80e4996d924766ba7157eec4fca85e","precision":"float32","gpu":false}),
        );
    }
    if op == "release" {
        state.sources.remove(key);
        state.video_previews.retain(|entry| entry.key != key);
        return Ok(json!({"ok":true}));
    }
    let path = r["path"].as_str().unwrap_or("");
    if op == "open" {
        let video = r["kind"] == "video";
        state.sources.clear();
        state.video_previews.clear();
        let source = if video {
            Source::Video(video_open(path)?)
        } else {
            Source::Photo(photo(path, 1800)?)
        };
        let meta = match &source {
            Source::Photo(p) => {
                json!({"width":p.width,"height":p.height,"raw":p.info.raw,"duration":0,"warnings":p.warnings})
            }
            Source::Video(v) => {
                let info = v.info();
                json!({"width":info.video.as_ref().map(|v|v.width),"height":info.video.as_ref().map(|v|v.height),"duration":info.duration.seconds(),"audio":info.has_audio(),"warnings":[]})
            }
        };
        state.sources.insert(key.into(), source);
        return Ok(meta);
    }
    let settings: Settings =
        serde_json::from_value(r["settings"].clone()).map_err(|e| e.to_string())?;
    settings.validate()?;
    if op == "preview" {
        let edge = r["edge"].as_u64().unwrap_or(1400).clamp(64, 1800) as usize;
        let draft = r["draft"].as_bool().unwrap_or(false);
        let time = r["time"].as_f64().unwrap_or(0.);
        if !time.is_finite() || time < 0. {
            return Err("Tiempo de preview inválido".into());
        }
        let source = state.sources.get(key).ok_or("Archivo no abierto")?;
        let started = Instant::now();
        let input_metrics = export_diagnostics::Metrics::default();
        let mut input_ms = 0.;
        let input_cache_hit;
        let render_started;
        let rendered = match source {
            Source::Photo(photo) => {
                input_cache_hit = true;
                render_started = Instant::now();
                render_quality(
                    &photo.pixels,
                    &photo.info,
                    if draft {
                        &photo.draft_cache
                    } else {
                        &photo.cache
                    },
                    &settings,
                    edge,
                    OutputDepth::F32Linear,
                    draft,
                )
            }
            Source::Video(video) => {
                let existing = state
                    .video_previews
                    .iter()
                    .position(|entry| entry.matches(key, time, edge, draft));
                input_cache_hit = existing.is_some();
                let index = if let Some(index) = existing {
                    index
                } else {
                    let input_started = Instant::now();
                    let pixels =
                        Arc::new(video_rgb_timed(video, time, edge, Some(&input_metrics))?);
                    input_ms = input_started.elapsed().as_secs_f64() * 1000.;
                    // At most one input and spatial-stage cache per quality level, for the active file.
                    state.video_previews.retain(|entry| entry.draft != draft);
                    state.video_previews.push(VideoPreviewInput {
                        key: key.into(),
                        time_bits: time.to_bits(),
                        edge,
                        draft,
                        pixels,
                        cache: StageCache::default(),
                    });
                    state.video_previews.len() - 1
                };
                let input = &state.video_previews[index];
                render_started = Instant::now();
                render_quality(
                    &input.pixels,
                    &SourceInfo::default(),
                    &input.cache,
                    &settings,
                    edge,
                    OutputDepth::F32Linear,
                    draft,
                )
            }
        };
        let render_ms = render_started.elapsed().as_secs_f64() * 1000.;
        let encode_started = Instant::now();
        let target = r["output"].as_str().ok_or("Missing output")?;
        std::fs::write(target, png(&rendered.image)?).map_err(|e| e.to_string())?;
        let png_ms = encode_started.elapsed().as_secs_f64() * 1000.;
        let total_ms = started.elapsed().as_secs_f64() * 1000.;
        let input = input_metrics.json();
        return Ok(
            json!({"path":target,"width":rendered.image.width,"height":rendered.image.height,"ms":total_ms,
            "previewDiagnostics":{"totalMs":total_ms,"inputPreparationMs":input_ms,"decodeMs":input["decodeMs"],
                "inputColorAndResizeMs":input["inputColorAndResizeMs"],"renderMs":render_ms,"pngEncodeAndWriteMs":png_ms,
                "inputCacheHit":input_cache_hit,"videoCacheEntries":state.video_previews.len(),"draft":draft,"edge":edge}}),
        );
    }
    if op == "export" {
        export_diagnostics::clear_last();
        let encoding = r["encoding"].as_str().unwrap_or("auto");
        if !matches!(encoding, "auto" | "cpu") {
            return Err("Modo de codificación inválido".into());
        }
        if cancel.load(Ordering::Relaxed) {
            return Err("Exportación cancelada".into());
        }
        let target = r["output"].as_str().ok_or("Missing output")?;
        let source = state.sources.get(key).ok_or("Archivo no abierto")?;
        match source {
            Source::Video(v) => export_video(
                v,
                settings,
                target,
                r["proxy"].as_bool().unwrap_or(false),
                encoding,
                id,
                out,
                cancel,
            ),
            Source::Photo(_) => {
                let photo_started = Instant::now();
                let p = photo(path, usize::MAX)?;
                let reveal_ms = photo_started.elapsed().as_secs_f64() * 1000.;
                let grade_started = Instant::now();
                let deep = render_export(
                    &p.pixels,
                    &p.info,
                    &p.cache,
                    &settings,
                    p.width.max(p.height),
                )?;
                let grade_ms = grade_started.elapsed().as_secs_f64() * 1000.;
                let encode_started = Instant::now();
                let ext = Path::new(target)
                    .extension()
                    .and_then(|v| v.to_str())
                    .unwrap_or("")
                    .to_lowercase();
                let icc = lightcraft_codecs::icc::write_named(lightcraft_codecs::NamedSpace::Srgb);
                let meta = lightcraft_codecs::EncodeMeta {
                    icc: Some(&icc),
                    ..Default::default()
                };
                let bytes = if ext == "jpg" || ext == "jpeg" {
                    lightcraft_codecs::encode_jpeg(
                        &lightcraft_codecs::EncodeImage::rgba8(&deep.to_rgba8()),
                        95,
                        lightcraft_codecs::ChromaSubsampling::S444,
                        &meta,
                    )
                    .map_err(|e| e.to_string())?
                } else {
                    let DeepSamples::F32(rgb) = deep.samples else {
                        return Err("Sin datos float".into());
                    };
                    let data: Vec<u16> = rgb
                        .iter()
                        .map(|v| {
                            (lightcraft_color::transfer::linear_to_srgb(*v).clamp(0., 1.) * 65535.)
                                .round() as u16
                        })
                        .collect();
                    lightcraft_codecs::encode_png(
                        &lightcraft_codecs::EncodeImage::new(
                            deep.width as u32,
                            deep.height as u32,
                            3,
                            lightcraft_codecs::Samples::U16(&data),
                        ),
                        &meta,
                    )
                    .map_err(|e| e.to_string())?
                };
                let encode_ms = encode_started.elapsed().as_secs_f64() * 1000.;
                if cancel.load(Ordering::Relaxed) {
                    return Err("Exportación cancelada".into());
                }
                let write_started = Instant::now();
                std::fs::write(target, bytes).map_err(|e| e.to_string())?;
                let diagnostics = json!({"schemaVersion":1,"appVersion":"0.4.0","status":"completed","format":ext,"width":p.width,"height":p.height,
                    "revealMs":reveal_ms,"gradeMs":grade_ms,"encodeMs":encode_ms,"writeMs":write_started.elapsed().as_secs_f64()*1000.,
                    "wallMs":photo_started.elapsed().as_secs_f64()*1000.,"displayPreviewGenerated":ext=="jpg"||ext=="jpeg","histogramGenerated":false,"settings":settings});
                export_diagnostics::save_last(diagnostics.clone());
                Ok(json!({"path":target,"engine":ENGINE,"diagnostics":diagnostics}))
            }
        }
    } else {
        Err(format!("Unknown operation: {op}"))
    }
}
fn main() {
    let nvenc_registered = export_diagnostics::initialize();
    let _ = nvenc_registered;
    let output = Arc::new(Mutex::new(io::stdout()));
    let cancel = Arc::new(AtomicBool::new(false));
    let cancel_id = Arc::new(AtomicU64::new(u64::MAX));
    let reader_cancel_id = cancel_id.clone();
    let c = cancel.clone();
    let writer = output.clone();
    let (tx, rx) = std::sync::mpsc::sync_channel::<Value>(8);
    std::thread::spawn(move || {
        for line in io::stdin().lock().lines() {
            match line {
                Ok(s) => match serde_json::from_str::<Value>(&s) {
                    Ok(v) => {
                        if v["op"] == "cancel" {
                            reader_cancel_id
                                .store(v["id"].as_u64().unwrap_or(u64::MAX), Ordering::Relaxed);
                            c.store(true, Ordering::Relaxed);
                        } else if tx.send(v).is_err() {
                            break;
                        }
                    }
                    Err(e) => send(&writer, json!({"id":null,"error":e.to_string()})),
                },
                Err(_) => break,
            }
        }
    });
    let mut state = State::default();
    for req in rx {
        cancel.store(
            cancel_id.load(Ordering::Relaxed) == req["id"].as_u64().unwrap_or(0),
            Ordering::Relaxed,
        );
        let id = req["id"].clone();
        let start = Instant::now();
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            run(&mut state, &req, output.clone(), cancel.clone())
        }));
        match result {
            Ok(Ok(v)) => send(
                &output,
                json!({"id":id,"result":v,"elapsedMs":start.elapsed().as_millis()}),
            ),
            Ok(Err(e)) => send(
                &output,
                json!({"id":id,"error":e,"diagnostics":if req["op"]=="export"{export_diagnostics::last()}else{None}}),
            ),
            Err(_) => send(
                &output,
                json!({"id":id,"error":"El motor encontró un fallo. El original no se modificó."}),
            ),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn direct_export_keeps_float_samples_with_curves_grain_and_leak() {
        let pixels = Arc::new(Rgb32f {
            width: 8,
            height: 6,
            data: (0..48).map(|i| [i as f32 / 60., 0.2, 0.6]).collect(),
        });
        let mut settings = Settings::default();
        settings.grain = 12.;
        settings.light_leak = 15.;
        settings.contrast = 14.;
        settings.hsl[3] = [15., -20., -10.];
        settings.curve = vec![[0., 0.02], [0.5, 0.55], [1., 0.98]];
        let normal = render(
            &pixels,
            &SourceInfo::default(),
            &StageCache::default(),
            &settings,
            8,
            OutputDepth::F32Linear,
        )
        .deep
        .unwrap();
        let direct = render_export(
            &pixels,
            &SourceInfo::default(),
            &StageCache::default(),
            &settings,
            8,
        )
        .unwrap();
        let (DeepSamples::F32(a), DeepSamples::F32(b)) = (normal.samples, direct.samples) else {
            panic!("wrong depth")
        };
        assert_eq!(a, b);
    }
    #[test]
    fn mixer_and_grain_size_are_validated_and_preserved() {
        let mut settings = Settings::default();
        settings.hsl[5] = [20., -35., 8.];
        settings.grain_size = 55.;
        settings.validate().unwrap();
        let d = settings.develop(&SourceInfo::default());
        assert_eq!(d.mixer.blue.sat, -35.);
        assert_eq!(d.grain.size, 55.);
        settings.hsl[5][1] = 101.;
        assert!(settings.validate().is_err());
    }
    #[test]
    fn video_preview_cache_requires_same_file_time_resolution_and_quality() {
        let input = VideoPreviewInput {
            key: "one".into(),
            time_bits: 0.3f64.to_bits(),
            edge: 640,
            draft: true,
            pixels: Arc::new(Rgb32f {
                width: 1,
                height: 1,
                data: vec![[0.; 3]],
            }),
            cache: StageCache::default(),
        };
        assert!(input.matches("one", 0.3, 640, true));
        assert!(!input.matches("two", 0.3, 640, true));
        assert!(!input.matches("one", 0.4, 640, true));
        assert!(!input.matches("one", 0.3, 1500, true));
        assert!(!input.matches("one", 0.3, 640, false));
    }
    #[test]
    fn float_working_values_survive_when_the_display_preview_quantizes_them() {
        let pixels = Arc::new(Rgb32f {
            width: 2,
            height: 1,
            data: vec![[0.20001; 3], [0.20002; 3]],
        });
        let result = render(
            &pixels,
            &SourceInfo::default(),
            &StageCache::default(),
            &Settings::default(),
            2,
            OutputDepth::F32Linear,
        );
        let DeepSamples::F32(samples) = result.deep.expect("float output").samples else {
            panic!("wrong output format")
        };
        assert!(
            samples[3] > samples[0],
            "internal precision must retain sub-8-bit differences"
        );
        assert_eq!(
            result.image.data[0], result.image.data[1],
            "display proxy may quantize them equally"
        );
    }
    #[test]
    fn rejects_unbounded_settings_and_invalid_curve_order() {
        let mut s = Settings::default();
        s.exposure = 500.;
        assert!(s.validate().is_err());
        s.exposure = 0.;
        s.curve = vec![[0.5, 0.5], [0.1, 0.2]];
        assert!(s.validate().is_err());
    }
    #[test]
    fn masks_reach_float_preview_and_export_and_disabled_masks_do_nothing() {
        let pixels = Arc::new(Rgb32f {
            width: 32,
            height: 24,
            data: (0..768)
                .map(|i| [0.03 + (i % 32) as f32 / 80., 0.2, 0.1])
                .collect(),
        });
        let info = SourceInfo::default();
        let shapes = [
            json!({"kind":"radial","center":{"x":0.3,"y":0.5},"rx":0.3,"ry":0.3,"angle":0,"feather":50,"invert":false}),
            json!({"kind":"linear","start":{"x":0.0,"y":0.0},"end":{"x":1.0,"y":1.0}}),
            json!({"kind":"luminanceRange","lo":0.0,"hi":0.7,"lo_feather":0.1,"hi_feather":0.1}),
            json!({"kind":"brush","strokes":[{"points":[{"x":0.3,"y":0.5},{"x":0.6,"y":0.5}],"size":0.15,"feather":50,"flow":100,"density":100,"erase":false,"auto_mask":false}]}),
        ];
        let base = render_export(
            &pixels,
            &info,
            &StageCache::default(),
            &Settings::default(),
            32,
        )
        .unwrap();
        let DeepSamples::F32(base) = base.samples else {
            panic!("depth")
        };
        for shape in shapes {
            let mut settings = Settings::default();
            settings.masks=serde_json::from_value(json!([{"id":1,"name":"Local","components":[{"shape":shape}],"adjust":{"exposure":1.0}}])).unwrap();
            settings.validate().unwrap();
            let cache = StageCache::default();
            let normal = render(
                &pixels,
                &info,
                &cache,
                &settings,
                32,
                OutputDepth::F32Linear,
            )
            .deep
            .unwrap();
            let direct =
                render_export(&pixels, &info, &StageCache::default(), &settings, 32).unwrap();
            let (DeepSamples::F32(a), DeepSamples::F32(b)) = (normal.samples, direct.samples)
            else {
                panic!("depth")
            };
            assert_eq!(a, b, "Preview/export mismatch");
            assert_ne!(a, base, "Mask had no effect");
            settings.masks[0].visible = false;
            let disabled =
                render_export(&pixels, &info, &StageCache::default(), &settings, 32).unwrap();
            let DeepSamples::F32(disabled) = disabled.samples else {
                panic!("depth")
            };
            assert_eq!(disabled, base);
        }
    }
}
