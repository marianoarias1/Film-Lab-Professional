const { spawn } = require("node:child_process");
const { EventEmitter } = require("node:events");
const readline = require("node:readline");
class Engine extends EventEmitter {
  constructor(binary) {
    super();
    this.binary = binary;
    this.pending = new Map();
    this.nextId = 0;
    this.running = false;
  }
  async start() {
    if (this.child) return this.request("hello");
    this.child = spawn(this.binary, [], {
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
    this.child.on("error", (e) => this.fail(e));
    this.child.on("exit", (code) => {
      this.child = null;
      this.fail(
        new Error(`El motor se cerró (${code}). Volvé a abrir la aplicación.`),
      );
    });
    this.child.stderr.on("data", (chunk) =>
      this.emit("log", chunk.toString().slice(-4000)),
    );
    readline
      .createInterface({ input: this.child.stdout })
      .on("line", (line) => {
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
      if (!this.child) {
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
          this.child?.kill();
        },
        op === "export" ? 24 * 60 * 60 * 1000 : 5 * 60 * 1000,
      );
      this.pending.set(id, { resolve, reject, timer, op });
      this.child.stdin.write(
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
  fail(error) {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(error);
    }
    this.pending.clear();
    this.emit("failure", error.message);
  }
  stop() {
    this.child?.kill();
  }
}
module.exports = { Engine };
