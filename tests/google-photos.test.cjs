const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {authorize,importPhotos,trusted,safeName,seconds}=require('../desktop/google-photos.cjs');
test('OAuth uses loopback, state, PKCE S256 and keeps token outside renderer',async()=>{
 const control=new AbortController();let redirect,challenge;
 const token=await authorize({signal:control.signal,openExternal:async value=>{const u=new URL(value);assert.equal(u.hostname,'accounts.google.com');redirect=u.searchParams.get('redirect_uri');assert.match(redirect,/^http:\/\/127\.0\.0\.1:\d+\/oauth\/callback$/);challenge=u.searchParams.get('code_challenge');assert.equal(u.searchParams.get('code_challenge_method'),'S256');
 const bad=await fetch(redirect+'?state=wrong&code=bad');assert.equal(bad.status,400);
 await fetch(redirect+'?'+new URLSearchParams({state:u.searchParams.get('state'),code:'test-code'}));},fetcher:async(url,options)=>{assert.equal(options.body.get('code'),'test-code');assert.equal(require('node:crypto').createHash('sha256').update(options.body.get('code_verifier')).digest('base64url'),challenge);return Response.json({access_token:'test-token'});}});
 assert.equal(token,'test-token');
});
test('Picker downloads paginated selected items, renames from actual MIME, reports failures, cleans session',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'fl-google-'));let deleted=false;const status=[];
 const fetcher=async(url,options)=>{
 if(url.includes('oauth2.googleapis.com'))return Response.json({access_token:'t'});
 assert.equal(options.headers.Authorization,'Bearer t');
 if(options.method==='DELETE'){deleted=true;return new Response(null,{status:204});}
 if(url.endsWith('/sessions'))return Response.json({id:'s',pickerUri:'https://photos.google.com/picker/test',mediaItemsSet:true});
 if(url.includes('mediaItems?')){const q=new URL(url).searchParams;assert.equal(q.get('sessionId'),'s');return Response.json(q.has('pageToken')?{mediaItems:[{type:'VIDEO',mediaFile:{filename:'movie.mov',baseUrl:'https://lh3.googleusercontent.com/video',mimeType:'video/mp4'}}]}:{mediaItems:[{type:'PHOTO',mediaFile:{filename:'../x.ARW',baseUrl:'https://lh3.googleusercontent.com/photo'}},{type:'PHOTO',mediaFile:{filename:'broken.jpg',baseUrl:'https://evil.example/x'}}],nextPageToken:'p2'});}
 if(url.endsWith('=d'))return new Response(new Uint8Array([255,216,255]),{headers:{'content-type':'image/jpeg'}});
 if(url.endsWith('=dv'))return new Response('video',{headers:{'content-type':'video/mp4'}});
 throw Error('Unexpected route');};
 try{const result=await importPhotos({destination:dir,signal:new AbortController().signal,onStatus:s=>status.push(s),fetcher,openExternal:async value=>{const u=new URL(value);if(u.hostname==='accounts.google.com')await fetch(u.searchParams.get('redirect_uri')+'?'+new URLSearchParams({state:u.searchParams.get('state'),code:'test'}));}});
 assert.equal(result.paths.length,2);assert.match(result.paths[0],/x\.jpg$/);assert.match(result.paths[1],/movie\.mp4$/);assert.equal(result.failures.length,1);assert.equal(deleted,true);assert.equal((await fs.readdir(dir)).some(n=>n.endsWith('.part')),false);assert.equal(status.length>0,true);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('OAuth cancellation releases callback listener',async()=>{
 const c=new AbortController();await assert.rejects(authorize({signal:c.signal,openExternal:async()=>c.abort()}),/cancelada/);
});
test('URL allowlist and names reject arbitrary network targets and traversal',()=>{
 assert.throws(()=>trusted('https://googleusercontent.com.evil.test/a','media'));
 assert.throws(()=>trusted('http://lh3.googleusercontent.com/a','media'));
 assert.throws(()=>trusted('https://evil.test/picker','picker'));
 assert.equal(safeName('C:\\folder\\image.jpg'),'image.jpg');assert.equal(seconds('2.5s',1),2500);
});
