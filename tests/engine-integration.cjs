const { Engine } = require("../desktop/engine.cjs");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const { spawnSync } = require("node:child_process");
const base = path.resolve(process.env.FILMLAB_FIXTURES || "tests/fixtures");
const bin =
  process.env.FILMLAB_ENGINE ||
  path.resolve(
    "native/target/release/filmlab-professional-engine" +
      (process.platform === "win32" ? ".exe" : ""),
  );
(async () => {
  const engine = new Engine(bin);
  engine.on("log", (s) => console.error(s));
  const out = path.join(base, "results");
  await fs.mkdir(out, { recursive: true });
  const timings = [];
  try {
    const hello = await engine.start();
    assert.equal(hello.precision, "float32");
    for (const [name, kind] of [
      ["gradient.jpg", "photo"],
      ["synthetic.dng", "photo"],
      ["precision16.tif", "photo"],
      ["clip.mp4", "video"],
    ]) {
      const source = path.join(base, name);
      const meta = await engine.request("open", {
        key: name,
        path: source,
        kind,
      });
      assert.ok(meta.width > 0 && meta.height > 0);
      if (kind === "video") assert.equal(meta.audio, true);
      for (const settings of [
        {},
        {
          exposure: 0.7,
          highlights: -30,
          shadows: 15,
          temperature: 12,
          grain: 10,
        },
        { lightLeak: 40, leakX: 0.4, leakY: 0.4 },
      ]) {
        const output = path.join(
          out,
          name + "-" + Object.keys(settings).join("-") + ".png",
        );
        const r = await engine.request("preview", {
          key: name,
          settings,
          time: 0.5,
          edge: 640,
          output,
        });
        assert.ok((await fs.stat(output)).size > 100);
        timings.push({ name, settings, ms: r.ms, elapsedMs: r.elapsedMs });
      }
      const output = path.join(
        out,
        name + (kind === "video" ? ".mp4" : ".png"),
      );
      await engine.request("export", {
        key: name,
        path: source,
        settings: { contrast: 10, highlights: -15 },
        output,
      });
      assert.ok((await fs.stat(output)).size > 100);
      if (kind === "photo") {
        const bytes = await fs.readFile(output);
        assert.equal(bytes[24], 16, "photo export must retain 16-bit samples");
        assert.ok(bytes.includes(Buffer.from("iCCP")), "output must carry its sRGB profile");
      }
      if (kind === "video") {
        const p = spawnSync(
          "ffprobe",
          [
            "-v",
            "error",
            "-show_streams",
            "-show_format",
            "-of",
            "json",
            output,
          ],
          { encoding: "utf8" },
        );
        if (!p.error) {
          assert.equal(p.status, 0);
          const info = JSON.parse(p.stdout);
          assert.ok(info.streams.some((s) => s.codec_type === "audio"));
          assert.ok(info.streams.some((s) => s.codec_type === "video"));
          assert.ok(Math.abs(Number(info.format.duration) - 2) < 0.2);
        }
      }
    }
    await assert.rejects(
      engine.request("preview", {
        key: "clip.mp4",
        settings: { exposure: 999 },
        output: path.join(out, "bad.png"),
      }),
    );
    await engine.request("open", {
      key: "jpeg",
      path: path.join(base, "gradient.jpg"),
      kind: "photo",
    });
    await engine.request("export", {
      key: "jpeg",
      path: path.join(base, "gradient.jpg"),
      settings: {},
      output: path.join(out, "jpeg-export.jpg"),
    });
    await fs.writeFile(
      path.join(out, "timings.json"),
      JSON.stringify(timings, null, 2),
    );
    console.log("JPEG, DNG, PNG16, JPEG95 y video con audio: OK");
    console.table(timings.map(({ name, ms }) => ({ name, ms })));
  } finally {
    engine.stop();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
