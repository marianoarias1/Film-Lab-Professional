// One background request at a time; editor rendering always takes priority.
export class FilmstripPreviews {
  constructor({request,has,present,canRun,delay=160}) {
    Object.assign(this,{request,has,present,canRun,delay});
    this.files=[]; this.failed=new WeakSet(); this.running=false; this.timer=null;
  }
  setFiles(files) { this.files=[...files]; this.wake(); }
  wake() {
    if(this.disposed || this.timer || this.running || !this.files.some(f=>!f.missing&&!this.has(f)&&!this.failed.has(f))) return;
    this.timer=setTimeout(()=>{this.timer=null;void this.next();},this.delay);
  }
  dispose() { this.disposed=true;clearTimeout(this.timer);this.timer=null;this.files=[]; }
  async next() {
    if(this.disposed||this.running)return;
    if(!this.canRun()){this.wake();return;}
    const file=this.files.find(f=>!f.missing&&!this.has(f)&&!this.failed.has(f));
    if(!file)return;
    this.running=true;
    try {
      const source=await this.request(file);
      if(this.files.includes(file)&&!file.missing&&!this.has(file)) {
        await this.present(file,source);
        if(!this.has(file))throw new Error("Thumbnail unavailable");
      }
    } catch { this.failed.add(file); }
    finally { this.running=false;this.wake(); }
  }
}
