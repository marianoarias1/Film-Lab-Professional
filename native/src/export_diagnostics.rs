//! Export-only instrumentation. Does not alter the photo/grade pipeline or project schema.
use filmcraft_export::{ExportSettings, Format, HardwareEncoding, VideoEncoder};
use filmcraft_time::FrameRate;
use serde_json::{Value, json};
use std::sync::{
    Mutex,
    atomic::{AtomicU64, Ordering},
};
use std::time::Instant;

static DECLINE: Mutex<Option<String>> = Mutex::new(None);
static LAST: Mutex<Option<Value>> = Mutex::new(None);
struct HardwareLog;
impl log::Log for HardwareLog {
    fn enabled(&self, meta: &log::Metadata) -> bool {
        meta.level() <= log::Level::Info
    }
    fn log(&self, record: &log::Record) {
        if !self.enabled(record.metadata()) {
            return;
        }
        let message = record.args().to_string();
        if message.starts_with("hardware encoding declined:") {
            *DECLINE.lock().unwrap_or_else(|e| e.into_inner()) =
                Some(message.chars().take(1200).collect());
        }
    }
    fn flush(&self) {}
}
static LOGGER: HardwareLog = HardwareLog;
pub fn initialize() -> bool {
    let _ = log::set_logger(&LOGGER);
    log::set_max_level(log::LevelFilter::Info);
    #[cfg(any(
        target_os = "windows",
        all(target_os = "linux", target_pointer_width = "64")
    ))]
    {
        filmcraft_export::register_encoder(preferred_factory);
        true
    }
    #[cfg(not(any(
        target_os = "windows",
        all(target_os = "linux", target_pointer_width = "64")
    )))]
    {
        false
    }
}
#[cfg(any(
    target_os = "windows",
    all(target_os = "linux", target_pointer_width = "64")
))]
fn preferred_factory(
    format: Format,
    width: u32,
    height: u32,
    rate: FrameRate,
    settings: &ExportSettings,
) -> Option<filmcraft_export::Result<Box<dyn VideoEncoder>>> {
    // Keep exactly the same VBR settings for both encoders. The library falls through to CPU
    // when the driver, device or dimensions cannot handle this request.
    filmcraft_platform::nvenc::export::factory(format, width, height, rate, settings)
}
pub fn clear_last() {
    *LAST.lock().unwrap_or_else(|e| e.into_inner()) = None;
}
pub fn last() -> Option<Value> {
    LAST.lock().unwrap_or_else(|e| e.into_inner()).clone()
}
pub fn save_last(value: Value) {
    *LAST.lock().unwrap_or_else(|e| e.into_inner()) = Some(value);
}
pub fn clear_decline() {
    *DECLINE.lock().unwrap_or_else(|e| e.into_inner()) = None;
}
pub fn decline() -> Option<String> {
    DECLINE.lock().unwrap_or_else(|e| e.into_inner()).clone()
}
#[derive(Default)]
pub struct Metrics {
    pub calls: AtomicU64,
    pub decode_ns: AtomicU64,
    pub input_ns: AtomicU64,
    pub grade_ns: AtomicU64,
    pub packing_ns: AtomicU64,
}
pub fn record(counter: &AtomicU64, start: Instant) {
    counter.fetch_add(
        start.elapsed().as_nanos().min(u64::MAX as u128) as u64,
        Ordering::Relaxed,
    );
}
impl Metrics {
    pub fn json(&self) -> Value {
        let ms = |c: &AtomicU64| c.load(Ordering::Relaxed) as f64 / 1_000_000.;
        json!({"sourceFrameCalls":self.calls.load(Ordering::Relaxed), "decodeMs":ms(&self.decode_ns), "inputColorAndResizeMs":ms(&self.input_ns), "gradeMs":ms(&self.grade_ns), "packingMs":ms(&self.packing_ns)})
    }
}
pub fn stages() -> Vec<(filmcraft_export::Stage, u64)> {
    filmcraft_export::stage_times()
}
pub fn stage_delta(before: &[(filmcraft_export::Stage, u64)]) -> Value {
    let mut map = serde_json::Map::new();
    for (stage, now) in stages() {
        let old = before
            .iter()
            .find(|(s, _)| *s == stage)
            .map_or(0, |(_, n)| *n);
        map.insert(
            stage.name().into(),
            json!(now.saturating_sub(old) as f64 / 1_000_000.),
        );
    }
    Value::Object(map)
}
pub fn encoder_name(requested: &str, before: &filmcraft_export::HwEncodeStats) -> &'static str {
    let now = filmcraft_export::hw_encode_stats();
    if now.sessions > before.sessions {
        "NVENC"
    } else if requested == "cpu" || now.declined > before.declined {
        "CPU"
    } else {
        "checking"
    }
}
pub fn settings(mode: &str, path: &str, scale: f32) -> ExportSettings {
    ExportSettings {
        path: path.into(),
        include_audio: true,
        sdr: true,
        crf: 18.,
        scale,
        // Vbr1Pass and 20 Mbps are the existing 0.1 defaults, not a new quality policy.
        hardware_encoding: if mode == "auto" {
            HardwareEncoding::Auto
        } else {
            HardwareEncoding::Off
        },
        ..Default::default()
    }
}

pub fn should_retry(requested: &str, attempt: usize, hardware_used: bool, cancelled: bool) -> bool {
    requested == "auto" && attempt == 0 && hardware_used && !cancelled
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn retries_only_failed_hardware_once_and_never_cancellation() {
        assert!(should_retry("auto", 0, true, false));
        assert!(!should_retry("auto", 1, true, false));
        assert!(!should_retry("auto", 0, true, true));
        assert!(!should_retry("auto", 0, false, false));
        assert!(!should_retry("cpu", 0, true, false));
    }
    #[test]
    fn cpu_and_auto_keep_previous_compression_settings() {
        let previous = ExportSettings {
            crf: 18.,
            ..Default::default()
        };
        for mode in ["auto", "cpu"] {
            let s = settings(mode, "out.mp4", 1.);
            assert_eq!(s.bitrate_mode, previous.bitrate_mode);
            assert_eq!(s.bitrate_kbps, previous.bitrate_kbps);
            assert_eq!(s.crf, previous.crf);
            assert!(s.include_audio);
        }
        assert_eq!(
            settings("cpu", "out.mp4", 1.).hardware_encoding,
            HardwareEncoding::Off
        );
        assert_eq!(
            settings("auto", "out.mp4", 1.).hardware_encoding,
            HardwareEncoding::Auto
        );
    }
}
