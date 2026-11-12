const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises');
async function load(){const s=await fs.readFile('ui/filmstrip-previews.js','utf8');return import('data:text/javascript;base64,'+Buffer.from(s).toString('base64'));}
test('filmstrip loads unopened photos serially and skips cached or missing files',async()=>{
 const {FilmstripPreviews}=await load(),seen=[],cache=new Set(),files=[{id:1},{id:2},{id:3,missing:true},{id:4}];cache.add(files[0]);
 let running=0,max=0,done;const complete=new Promise(r=>done=r);
 const q=new FilmstripPreviews({delay:0,request:async f=>{running++;max=Math.max(max,running);seen.push(f.id);await Promise.resolve();running--;return 'image';},has:f=>cache.has(f),present:async f=>{cache.add(f);if(f.id===4)done();},canRun:()=>true});
 try{q.setFiles(files);await complete;assert.deepEqual(seen,[2,4]);assert.equal(max,1);}finally{q.dispose();}
});
test('removed photos cannot publish stale thumbnails; failures do not loop',async()=>{
 const {FilmstripPreviews}=await load();const file={},shown=[];let resolve;
 const q=new FilmstripPreviews({delay:100,request:()=>new Promise(r=>resolve=r),has:()=>false,present:f=>shown.push(f),canRun:()=>true});
 try{q.files=[file];const pending=q.next();q.setFiles([]);resolve('image');await pending;assert.deepEqual(shown,[]);}finally{q.dispose();}
 let calls=0;const failed=new FilmstripPreviews({delay:100,request:async()=>{calls++;throw Error('bad file');},has:()=>false,present:()=>{},canRun:()=>true});
 try{failed.files=[file];await failed.next();await failed.next();assert.equal(calls,1);}finally{failed.dispose();}
});
test('editor work pauses thumbnail requests',async()=>{
 const {FilmstripPreviews}=await load();let idle=false,calls=0;
 const cached=new Set(),file={};const q=new FilmstripPreviews({delay:100,request:async()=>{calls++;return 'image'},has:f=>cached.has(f),present:async f=>cached.add(f),canRun:()=>idle});
 try{q.files=[file];await q.next();assert.equal(calls,0);idle=true;await q.next();assert.equal(calls,1);}finally{q.dispose();}
});
