// One render in flight and one replaceable latest intent. A continuous drag must
// still present intermediate results; only a different context invalidates them.
export class PreviewQueue {
  constructor({
    render,
    present,
    onError = () => {},
    onBusy = () => {},
    onSample = () => {},
    now = () => performance.now(),
  }) {
    Object.assign(this, { render, present, onError, onBusy, onSample, now });
    this.epoch = 0;
    this.pending = null;
    this.running = false;
    this.scheduled = false;
    this.coalesced = 0;
  }
  invalidate() {
    this.epoch++;
    this.pending = null;
  }
  request(job) {
    if (this.pending) this.coalesced++;
    this.pending = { ...job, epoch: this.epoch };
    if (!this.scheduled) {
      this.scheduled = true;
      queueMicrotask(() => {
        this.scheduled = false;
        void this.pump();
      });
    }
  }
  async pump() {
    if (this.running || !this.pending) return;
    this.running = true;
    this.onBusy(true);
    const job = this.pending;
    this.pending = null;
    const current = () => job.epoch === this.epoch;
    const started = this.now();
    try {
      const result = await this.render(job);
      const received = this.now();
      // A late full-quality refinement must not replace a more recent gesture.
      const supersededRefinement = !job.draft && !!this.pending;
      let presented = false;
      if (current() && !supersededRefinement)
        presented = (await this.present(result, job, current)) !== false;
      this.onSample({
        job,
        result,
        presented,
        coalesced: this.coalesced,
        ipcMs: received - started,
        presentationMs: this.now() - received,
        inputToPaintMs: presented ? this.now() - job.inputAt : null,
      });
    } catch (error) {
      if (current()) this.onError(error, job);
    } finally {
      this.running = false;
      if (this.pending) void this.pump();
      else this.onBusy(false);
    }
  }
}
