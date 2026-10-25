const { Engine } = require("../desktop/engine.cjs");
const fs = require("node:fs/promises");
const path = require("node:path");
const assert = require("node:assert/strict");
(async () => {
  const base = path.resolve("tests/fixtures"),
    out = path.join(base, "results");
  await fs.mkdir(out, { recursive: true });
  const e = new Engine(
    process.env.FILMLAB_ENGINE ||
      path.resolve(
        "native/target/release/filmlab-professional-engine" +
          (process.platform === "win32" ? ".exe" : ""),
      ),
  );
  try {
    await e.start();
    await e.request("open", {
      key: "v",
      kind: "video",
      path: path.join(base, "clip.mp4"),
    });
    let n = 0;
    const preview = async (time, draft, settings = {}) => {
      const r = await e.request("preview", {
        key: "v",
        time,
        draft,
        edge: draft ? 640 : 1500,
        settings,
        output: path.join(out, "cached-" + n++ + ".png"),
      });
      assert(r.previewDiagnostics.totalMs >= 0);
      assert(r.previewDiagnostics.videoCacheEntries <= 2);
      return r.previewDiagnostics;
    };
    assert.equal((await preview(0.1, true)).inputCacheHit, false);
    assert.equal(
      (await preview(0.1, true, { exposure: 0.3 })).inputCacheHit,
      true,
    );
    assert.equal((await preview(0.2, true)).inputCacheHit, false);
    assert.equal((await preview(0.2, false)).inputCacheHit, false);
    assert.equal(
      (await preview(0.2, false, { contrast: 15 })).inputCacheHit,
      true,
    );
    assert.equal((await preview(0.2, true, { grain: 10 })).inputCacheHit, true);
    await assert.rejects(() => preview(-1, true), /inválido/);
    await e.request("open", {
      key: "other",
      kind: "video",
      path: path.join(base, "clip.mp4"),
    });
    const r = await e.request("preview", {
      key: "other",
      time: 0.2,
      draft: true,
      edge: 640,
      settings: {},
      output: path.join(out, "new-file-preview.png"),
    });
    assert.equal(r.previewDiagnostics.inputCacheHit, false);
    await e.request("release", { key: "other" });
    await assert.rejects(
      () =>
        e.request("preview", {
          key: "other",
          time: 0.2,
          draft: true,
          settings: {},
        }),
      /no abierto/,
    );
    console.log(
      "Preview cache: hits, seek invalidation, quality separation, two-entry bound, new source and release OK.",
    );
  } finally {
    e.stop();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
