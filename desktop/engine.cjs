const { spawn } = require("node:child_process");
const { EventEmitter } = require("node:events");
const readline = require("node:readline");
class Engine extends EventEmitter {
  constructor(binary) {
    super();
    this.binary = binary;
    this.pending = new Map();
    this.nextId = 0;
  }
  async start() {
    if (this.child) return this.request("hello");
    const child = this.child = spawn(this.binary, [], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      env: {
        ...process.env,
        RAYON_NUM_THREADS: String(
          Math.max(
            1,
            Math.min(8, require("node:os").availableParallelism() - 1),
          ),
        ),
      },
    });
    child.on("error", (error) => {
      if (this.child !== child) return;
      this.child = null;
      this.fail(error);
    });
    child.on("exit", (code) => {
      if (this.child !== child) return;
      this.child = null;
      this.fail(
        new Error(`El motor se cerró (${code}). Volvé a abrir la aplicación.`),
      );
    });
    // A write can fail while the child is exiting. Request callbacks handle
    // their own rejection; retain a listener for the stream's error event.
    child.stdin.on("error", () => {});
    child.stderr.on("data", (chunk) => {
      if (this.child === child) this.emit("log", chunk.toString().slice(-4000));
    });
    readline
      .createInterface({ input: child.stdout })
      .on("line", (line) => {
        if (this.child !== child) return;
        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          return;
        }
        if (msg.event) {
          this.emit(msg.event, msg);
          return;
        }
        const p = this.pending.get(msg.id);
        if (!p) return;
        this.pending.delete(msg.id);
        clearTimeout(p.timer);
        msg.error
          ? p.reject(Object.assign(new Error(msg.error), { diagnostics: msg.diagnostics }))
          : p.resolve({ ...msg.result, elapsedMs: msg.elapsedMs });
      });
    return this.request("hello");
  }
  request(op, data = {}) {
    return new Promise((resolve, reject) => {
      const child = this.child;
      if (!child) {
        reject(
          new Error(
            "No se encontró el motor. Ejecutá npm run build:engine primero.",
          ),
        );
        return;
      }
      const id = ++this.nextId;
      const timer = setTimeout(
        () => {
          this.pending.delete(id);
          reject(
            new Error(
              "El motor superó el tiempo de espera. Reiniciá la aplicación.",
            ),
          );
          if (this.child === child) child.kill();
        },
        op === "export" ? 24 * 60 * 60 * 1000 : 5 * 60 * 1000,
      );
      this.pending.set(id, { resolve, reject, timer, op });
      child.stdin.write(
        JSON.stringify({ ...data, id, op }) + "\n",
        (e) => {
          if (e) {
            clearTimeout(timer);
            this.pending.delete(id);
            reject(e);
          }
        },
      );
    });
  }
  cancel() {
    const request = [...this.pending].find(([,p])=>p.op === "export");
    if(request)this.child?.stdin.write(JSON.stringify({ op: "cancel", id: request[0] }) + "\n");
  }
  fail(error, { notify = true } = {}) {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(error);
    }
    this.pending.clear();
    if (notify) this.emit("failure", error.message);
  }
  stop() {
    const child = this.child;
    if (!child) return;
    // A normal stop must release pending work without reporting a crash.
    this.child = null;
    this.fail(new Error("La aplicación se está cerrando."), { notify: false });
    child.kill();
  }
}
module.exports = { Engine };
