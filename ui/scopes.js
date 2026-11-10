const BINS = 256;
const CHANNELS = [[255, 91, 103], [95, 222, 137], [105, 157, 255]];
const LABELS = {
  histogram: "Histograma RGB",
  waveform: "Forma de onda RGB",
  parade: "Parade RGB",
};

export function analyzeRGB(pixels, width, height, withWave = false) {
  const histogram = Array.from({ length: 3 }, () => new Uint32Array(BINS));
  const wave = withWave ? Array.from({ length: 3 }, () => new Uint32Array(BINS * BINS)) : null;
  for (let y = 0, offset = 0; y < height; y++) {
    for (let x = 0; x < width; x++, offset += 4) {
      if (!pixels[offset + 3]) continue;
      const column = wave ? Math.floor(x * BINS / width) : 0;
      for (let channel = 0; channel < 3; channel++) {
        const value = pixels[offset + channel];
        histogram[channel][value]++;
        if (wave) wave[channel][(255 - value) * BINS + column]++;
      }
    }
  }
  return { histogram, wave, height };
}

function plotHistogram(ctx, bins, x, y, w, h, compact) {
  const peak = Math.max(1, ...bins.flatMap(channel => [...channel]));
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  bins.forEach((values, channel) => {
    const color = CHANNELS[channel].join(",");
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    values.forEach((n, i) => ctx.lineTo(x + w * i / 255, y + h * (1 - n / peak)));
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
    ctx.fillStyle = `rgba(${color},${compact ? .45 : .28})`;
    ctx.strokeStyle = `rgba(${color},.85)`;
    ctx.lineWidth = compact ? 1.5 : 1;
    ctx.fill();
    ctx.stroke();
  });
  ctx.restore();
}

function plotWave(ctx, raster, sample, mode, x, y, w, h) {
  const { wave, height } = sample;
  if (!wave) return;
  const width = mode === "parade" ? BINS * 3 : BINS;
  raster.width = width;
  raster.height = BINS;
  const rc = raster.getContext("2d");
  const frame = rc.createImageData(width, BINS);
  const gain = Math.max(3, height / 18);
  for (let c = 0; c < 3; c++) {
    const color = CHANNELS[c];
    for (let i = 0; i < wave[c].length; i++) {
      const n = wave[c][i];
      if (!n) continue;
      const col = i % BINS + (mode === "parade" ? c * BINS : 0);
      const p = (Math.floor(i / BINS) * width + col) * 4;
      const energy = 1 - Math.exp(-Math.sqrt(n / gain) * 1.7);
      for (let k = 0; k < 3; k++) frame.data[p + k] += Math.round(color[k] * energy);
      frame.data[p + 3] = 255;
    }
  }
  rc.putImageData(frame, 0, 0);
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.drawImage(raster, x, y, w, h);
  ctx.restore();
}

export function mountScopes($) {
  const root = $("scopes"), panel = $("scopePanel"), toggle = $("scopeToggle");
  const photo = $("preview"), video = $("playback"), mini = $("scopeMini"), plot = $("scopePlot");
  const sampler = document.createElement("canvas"), raster = document.createElement("canvas");
  const sampleCtx = sampler.getContext("2d", { willReadFrequently: true });
  let mode = "histogram", data = null, timer = 0, last = -Infinity;
  let expanded = false;

  function paint() {
    if (!data) return;
    const small = mini.getContext("2d");
    small.clearRect(0, 0, mini.width, mini.height);
    plotHistogram(small, data.histogram, 1, 2, mini.width - 2, mini.height - 4, true);
    if (!expanded || panel.hidden) return;
    const cssWidth = plot.clientWidth, cssHeight = plot.clientHeight;
    if (!cssWidth || !cssHeight) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    plot.width = Math.round(cssWidth * ratio);
    plot.height = Math.round(cssHeight * ratio);
    const ctx = plot.getContext("2d");
    ctx.scale(ratio, ratio);
    const x = mode === "histogram" ? 10 : 33, y = 11;
    const w = cssWidth - x - 12, h = cssHeight - 32;
    ctx.font = "10px system-ui";
    ctx.fillStyle = "#9ca8a1";
    ctx.strokeStyle = "#303632";
    ctx.lineWidth = 1;
    ctx.textAlign = "right";
    for (let i = 0; i <= 4; i++) {
      const py = y + h * i / 4;
      ctx.beginPath(); ctx.moveTo(x, py); ctx.lineTo(x + w, py); ctx.stroke();
      if (mode !== "histogram") ctx.fillText(String(100 - i * 25), x - 6, py + 3);
    }
    const steps = mode === "parade" ? 3 : 4;
    for (let i = 0; i <= steps; i++) {
      const px = x + w * i / steps;
      ctx.beginPath(); ctx.moveTo(px, y); ctx.lineTo(px, y + h); ctx.stroke();
    }
    if (mode === "histogram") {
      plotHistogram(ctx, data.histogram, x, y, w, h, false);
      for (const [t, position, align] of [["0", 0, "left"], ["128", .5, "center"], ["255", 1, "right"]]) {
        ctx.textAlign = align; ctx.fillText(t, x + w * position, y + h + 15);
      }
    } else {
      plotWave(ctx, raster, data, mode, x, y, w, h);
      ctx.textAlign = "center";
      if (mode === "parade") ["R", "G", "B"].forEach((t, i) => ctx.fillText(t, x + w * (i + .5) / 3, y + h + 15));
      else ctx.fillText("Posición horizontal", x + w / 2, y + h + 15);
    }
  }

  function refresh() {
    timer = 0;
    last = performance.now();
    const source = video.hidden ? photo : video;
    const width = source === video ? video.videoWidth : photo.naturalWidth;
    const height = source === video ? video.videoHeight : photo.naturalHeight;
    if (source.hidden || !width || !height ||
        (source === photo ? !photo.complete : video.readyState < 2)) {
      root.hidden = true;
      data = null;
      return;
    }
    // Use the displayed, color-managed SDR preview, never the original RAW buffer.
    const scale = Math.min(1, 1500 / Math.max(width, height));
    const sw = Math.max(1, Math.round(width * scale)), sh = Math.max(1, Math.round(height * scale));
    if (sampler.width !== sw || sampler.height !== sh) {
      sampler.width = sw; sampler.height = sh;
    }
    try {
      sampleCtx.clearRect(0, 0, sw, sh);
      sampleCtx.drawImage(source, 0, 0, sw, sh);
      data = analyzeRGB(sampleCtx.getImageData(0, 0, sw, sh).data, sw, sh, expanded && mode !== "histogram");
      root.hidden = false;
      $("scopeSource").textContent = source === video ? "Reproducción · SDR" : "Vista previa · SDR";
      paint();
    } catch {
      data = null;
      root.hidden = true;
    }
  }

  function schedule() {
    if (!timer) timer = setTimeout(refresh, Math.max(0, 110 - (performance.now() - last)));
  }
  function setExpanded(value) {
    expanded = value;
    toggle.setAttribute("aria-expanded", String(value));
    panel.hidden = !value;
    schedule();
  }
  toggle.onclick = () => setExpanded(!expanded);
  root.addEventListener("keydown", e => {
    if (e.key === "Escape" && expanded) {
      e.stopPropagation();
      setExpanded(false); toggle.focus();
    }
  });
  $("scopeModes").querySelectorAll("[data-scope]").forEach(button => {
    button.onclick = () => {
      mode = button.dataset.scope;
      plot.setAttribute("aria-label", LABELS[mode] + " de la vista previa");
      $("scopeModes").querySelectorAll("[data-scope]").forEach(item => item.setAttribute("aria-pressed", String(item === button)));
      schedule();
    };
  });
  photo.addEventListener("load", schedule);
  photo.addEventListener("error", schedule);
  ["loadeddata", "seeked", "timeupdate", "emptied"].forEach(event => video.addEventListener(event, schedule));
  const observer = new MutationObserver(schedule);
  for (const node of [photo, video]) observer.observe(node, { attributes: true, attributeFilter: ["hidden"] });
  new ResizeObserver(paint).observe(plot);
}
