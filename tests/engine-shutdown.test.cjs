const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { PassThrough } = require("node:stream");
const childProcess = require("node:child_process");

test("Stopping the engine rejects pending work silently; an unexpected exit still reports a failure", async t => {
  const children = [];
  t.mock.method(childProcess, "spawn", () => {
    const child = new EventEmitter();
    child.stdin = new PassThrough();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin.resume();
    child.kill = t.mock.fn();
    children.push(child);
    return child;
  });
  const { Engine } = require("../desktop/engine.cjs");
  const engine = new Engine("mock");
  const failures = [];
  engine.on("failure", message => failures.push(message));

  const starting = engine.start();
  const child = children[0];
  child.stdout.write('{"id":1,"result":{"ok":true}}\n');
  assert.equal((await starting).ok, true);
  const pending = engine.request("preview");
  engine.stop();
  engine.stop();
  await assert.rejects(pending, /cerrando/);
  assert.equal(child.kill.mock.callCount(), 1);
  assert.equal(engine.pending.size, 0);

  const restarting = engine.start();
  const current = children[1];
  child.emit("exit", null, "SIGTERM");
  child.emit("error", new Error("late child error"));
  assert.deepEqual(failures, []);
  assert.equal(engine.child, current);

  current.emit("exit", 1);
  await assert.rejects(restarting, /El motor se cerró \(1\)/);
  assert.equal(engine.child, null);
  assert.equal(failures.length, 1);
  for (const process of children) process.stdout.end();
});
