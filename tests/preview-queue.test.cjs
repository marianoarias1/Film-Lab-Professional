const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const { PreviewMetrics, LIMIT } = require("../desktop/preview-metrics.cjs");
const tick = () => new Promise((r) => setImmediate(r));
async function queueClass() {
  return (
    await import(
      "data:text/javascript;base64," +
        Buffer.from(await fs.readFile("ui/preview-queue.js")).toString("base64")
    )
  ).PreviewQueue;
}
function harness(PreviewQueue) {
  const work = [],
    shown = [],
    samples = [],
    errors = [],
    busy = [];
  let active = 0,
    maxActive = 0;
  const queue = new PreviewQueue({
    render: (job) =>
      new Promise((resolve, reject) => {
        active++;
        maxActive = Math.max(maxActive, active);
        work.push({
          job,
          resolve: (value) => {
            active--;
            resolve(value);
          },
          reject: (error) => {
            active--;
            reject(error);
          },
        });
      }),
    present: (_, job) => {
      shown.push(job.value);
    },
    onSample: (s) => samples.push(s),
    onError: (e) => errors.push(e.message),
    onBusy: (v) => busy.push(v),
    now: () => 100,
  });
  return { queue, work, shown, samples, errors, busy, max: () => maxActive };
}
test("continuous drag presents completed drafts while keeping only the latest pending intent", async () => {
  const h = harness(await queueClass());
  h.queue.request({ value: 1, draft: true, inputAt: 0 });
  await tick();
  h.queue.request({ value: 2, draft: true, inputAt: 0 });
  h.queue.request({ value: 3, draft: true, inputAt: 0 });
  h.work[0].resolve({});
  await tick();
  assert.deepEqual(h.shown, [1]);
  assert.deepEqual(
    h.work.map((w) => w.job.value),
    [1, 3],
  );
  h.work[1].resolve({});
  await tick();
  assert.deepEqual(h.shown, [1, 3]);
  assert.equal(h.max(), 1);
  assert.equal(h.samples[1].coalesced, 1);
  assert.equal(h.busy.at(-1), false);
});
test("switching file invalidates an old result and still renders the new file", async () => {
  const h = harness(await queueClass());
  h.queue.request({ value: "old", draft: true, inputAt: 0 });
  await tick();
  h.queue.invalidate();
  h.queue.request({ value: "new", draft: true, inputAt: 0 });
  h.work[0].resolve({});
  await tick();
  assert.deepEqual(h.shown, []);
  h.work[1].resolve({});
  await tick();
  assert.deepEqual(h.shown, ["new"]);
  assert.equal(h.samples[0].presented, false);
});
test("a superseded refinement does not flash over a new draft", async () => {
  const h = harness(await queueClass());
  h.queue.request({ value: "old-full", draft: false, inputAt: 0 });
  await tick();
  h.queue.request({ value: "new-draft", draft: true, inputAt: 0 });
  h.work[0].resolve({});
  await tick();
  assert.deepEqual(h.shown, []);
  h.work[1].resolve({});
  await tick();
  h.queue.request({ value: "final-full", draft: false, inputAt: 0 });
  await tick();
  h.work[2].resolve({});
  await tick();
  assert.deepEqual(h.shown, ["new-draft", "final-full"]);
});
test("an obsolete failure cannot show an error on a different file", async () => {
  const h = harness(await queueClass());
  h.queue.request({ value: 1, draft: true, inputAt: 0 });
  await tick();
  h.queue.invalidate();
  h.work[0].reject(new Error("old"));
  await tick();
  assert.deepEqual(h.errors, []);
  assert.equal(h.busy.at(-1), false);
});
test("preview telemetry is bounded, immutable, rejects invalid timings, and separates refined and interactive samples", () => {
  const m = new PreviewMetrics();
  for (let n = 0; n < LIMIT + 5; n++)
    m.add({
      fileName: "photo.jpg",
      kind: "photo",
      quality: "draft",
      native: { totalMs: 12 },
      settings: { exposure: 1 },
    });
  assert.equal(m.samples.length, LIMIT);
  const id = m.samples.at(-1).traceId;
  m.acknowledge({
    traceId: id,
    presented: true,
    inputToPaintMs: 40,
    ipcMs: Infinity,
    presentationMs: -1,
  });
  assert.equal(m.samples.at(-1).ipcMs, undefined);
  const full = m.add({
    fileName: "photo.jpg",
    kind: "photo",
    quality: "refined",
    native: { totalMs: 20 },
  });
  m.acknowledge({ traceId: full, presented: true, inputToPaintMs: 80 });
  const report = m.report();
  assert.equal(report.summary[0].inputToPaintMedianMs, 40);
  assert.equal(report.summary[1].inputToPaintMedianMs, 80);
  report.samples[0].settings.exposure = 99;
  assert.equal(m.samples[0].settings.exposure, 1);
  assert.equal(m.acknowledge({ traceId: "unknown" }), false);
});
