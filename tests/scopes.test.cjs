const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const moduleReady = fs.readFile(path.join(__dirname, "../ui/scopes.js")).then(bytes =>
  import("data:text/javascript;base64," + bytes.toString("base64"))
);

test("RGB histogram counts real code values and ignores transparent pixels", async () => {
  const { analyzeRGB } = await moduleReady;
  const pixels = new Uint8ClampedArray([255, 128, 0, 255, 255, 0, 255, 255, 12, 34, 56, 0]);
  const { histogram, wave } = analyzeRGB(pixels, 3, 1);
  assert.equal(wave, null);
  assert.equal(histogram[0][255], 2);
  assert.equal(histogram[1][128], 1);
  assert.equal(histogram[2][0], 1);
  for (const channel of histogram) assert.equal(channel.reduce((a, b) => a + b), 2);
});

test("waveform preserves horizontal position and places white above black", async () => {
  const { analyzeRGB } = await moduleReady;
  const pixels = new Uint8ClampedArray([255, 0, 128, 255, 0, 255, 128, 255]);
  const { wave } = analyzeRGB(pixels, 2, 1, true);
  assert.equal(wave[0][0], 1);
  assert.equal(wave[0][255 * 256 + 128], 1);
  assert.equal(wave[1][255 * 256], 1);
  assert.equal(wave[1][128], 1);
  assert.equal(wave[2][127 * 256], 1);
  assert.equal(wave[2][127 * 256 + 128], 1);
});
