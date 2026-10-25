const os = require("node:os");
const { randomUUID } = require("node:crypto");
const LIMIT = 120;
const percentile = (values, p) => {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  return v.length
    ? v[Math.min(v.length - 1, Math.ceil(v.length * p) - 1)]
    : null;
};
class PreviewMetrics {
  constructor() {
    this.samples = [];
  }
  add(sample) {
    const traceId = randomUUID();
    this.samples.push({ ...sample, traceId });
    if (this.samples.length > LIMIT) this.samples.shift();
    return traceId;
  }
  acknowledge(message) {
    const sample = this.samples.find((s) => s.traceId === message.traceId);
    if (!sample) return false;
    for (const key of [
      "inputToPaintMs",
      "ipcMs",
      "presentationMs",
      "coalescedInputs",
    ]) {
      const value = message[key];
      if (Number.isFinite(value) && value >= 0 && value <= 1e6)
        sample[key] = value;
    }
    sample.presented = message.presented === true;
    return true;
  }
  report() {
    const samples = structuredClone(this.samples),
      groups = [];
    for (const kind of ["photo", "video"])
      for (const quality of ["draft", "refined"]) {
        const all = samples.filter(
            (s) => s.kind === kind && s.quality === quality,
          ),
          visible = all.filter((s) => s.presented);
        if (!all.length) continue;
        groups.push({
          kind,
          quality,
          requests: all.length,
          presented: visible.length,
          inputToPaintMedianMs: percentile(
            visible.map((s) => s.inputToPaintMs),
            0.5,
          ),
          inputToPaintP95Ms: percentile(
            visible.map((s) => s.inputToPaintMs),
            0.95,
          ),
          nativeMedianMs: percentile(
            all.map((s) => s.native?.totalMs),
            0.5,
          ),
          queueMedianMs: percentile(
            all.map((s) => s.queueWaitMs),
            0.5,
          ),
        });
      }
    return {
      schemaVersion: 1,
      type: "preview-interaction",
      appVersion: "0.4.0",
      createdAt: new Date().toISOString(),
      host: {
        platform: process.platform,
        arch: process.arch,
        cpu: os.cpus()[0]?.model,
        logicalProcessors: os.availableParallelism(),
        ramBytes: os.totalmem(),
      },
      sampleLimit: LIMIT,
      summary: groups,
      samples,
      notes: [
        "Informe local: no contiene imágenes, videos ni rutas de archivos. Sí contiene nombres y valores de ajustes.",
        "inputToPaintMs estima desde la intención de preview hasta dos requestAnimationFrame después de actualizar la imagen; no mide físicamente la pantalla.",
        "Los refinamientos se solicitan tras una pausa de 180 ms y su medición comienza al solicitarlos. No mezclar sus tiempos con los de arrastre.",
        "Se retienen como máximo las últimas 120 previews procesadas correctamente de esta sesión. coalescedInputs es un contador acumulado de intenciones reemplazadas antes de enviarse: no se deben sumar sus valores entre muestras.",
      ],
    };
  }
}
module.exports = { PreviewMetrics, percentile, LIMIT };
