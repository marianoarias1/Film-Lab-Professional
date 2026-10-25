const http = require("node:http");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const {Readable} = require("node:stream");
const {pipeline} = require("node:stream/promises");
const {setTimeout: delay} = require("node:timers/promises");
const CLIENT_ID = "163447438332-t02v7eeipma9l0s8m7qf8d3j5ueekq2g.apps.googleusercontent.com";
const SCOPE = "https://www.googleapis.com/auth/photospicker.mediaitems.readonly";
function trusted(value, kind) {
  const u = new URL(value);
  const host = u.hostname;
  const ok = kind === "picker" ? host === "photos.google.com" : host === "googleusercontent.com" || host.endsWith(".googleusercontent.com");
  if(u.protocol !== "https:" || u.username || u.password || !ok) throw new Error("Google devolvió una dirección no permitida.");
  return u.href;
}
function seconds(value, fallback) {
  const n = Number(String(value || "").replace(/s$/, ""));
  return Number.isFinite(n) && n > 0 ? n * 1000 : fallback;
}
function safeName(name) {
  return path.basename(String(name || "archivo").replace(/\\/g,"/")).replace(/[<>:"/\\|?*\x00-\x1f]/g,"_").replace(/[. ]+$/,"").slice(0,120) || "archivo";
}
async function authorize({openExternal, signal, fetcher = fetch, secret}) {
  const state = crypto.randomBytes(32).toString("base64url");
  const verifier = crypto.randomBytes(48).toString("base64url");
  let resolveCode, rejectCode;
  const codePromise = new Promise((resolve,reject)=>{resolveCode=resolve;rejectCode=reject;});
  // Register before opening browser; never log codes, tokens, or callback URLs.
  codePromise.catch(()=>{});
  const server = http.createServer((req,res)=>{
    const u = new URL(req.url,"http://127.0.0.1");
    res.setHeader("Cache-Control","no-store");
    res.setHeader("Content-Type","text/plain; charset=utf-8");
    if(req.method !== "GET" || u.pathname !== "/oauth/callback" || u.searchParams.get("state") !== state){res.writeHead(400).end("Solicitud no válida.");return;}
    if(u.searchParams.has("error")){res.end("Autorización cancelada. Volvé a Film Lab.");rejectCode(new Error("Google no autorizó el acceso. Revisá el usuario de prueba y los permisos."));return;}
    const code=u.searchParams.get("code");
    if(!code){res.writeHead(400).end("Falta el código.");return;}
    res.end("Listo. Podés volver a Film Lab Professional.");resolveCode(code);
  });
  const abort=()=>rejectCode(new Error("Conexión cancelada."));
  signal.addEventListener("abort",abort,{once:true});
  let timer;
  try {
    signal.throwIfAborted();
    await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",resolve);});
    const redirect = `http://127.0.0.1:${server.address().port}/oauth/callback`;
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({client_id:CLIENT_ID,redirect_uri:redirect,response_type:"code",scope:SCOPE,state,code_challenge:crypto.createHash("sha256").update(verifier).digest("base64url"),code_challenge_method:"S256",access_type:"online",prompt:"select_account"}).toString();
    timer=setTimeout(()=>rejectCode(new Error("Se agotó el tiempo para iniciar sesión. Volvé a intentarlo.")),300000);
    await openExternal(url.href);
    const code = await codePromise;
    const body = new URLSearchParams({client_id:CLIENT_ID,code,code_verifier:verifier,redirect_uri:redirect,grant_type:"authorization_code"});
    if(secret) body.set("client_secret",secret);
    const r=await fetcher("https://oauth2.googleapis.com/token",{method:"POST",body,signal:AbortSignal.any([signal,AbortSignal.timeout(30000)])});
    const data=await r.json();
    if(!r.ok || !data.access_token) {
      const code = String(data.error || r.status).replace(/[^a-zA-Z0-9_-]/g, "").slice(0,80);
      // Show only Google's diagnostic field, never the response object or OAuth material.
      const detail = String(data.error_description || "Google no informó un detalle adicional.")
        .replace(/https?:\/\/[^\s]+/g, "[URL omitida]")
        .replace(/(?:GOCSPX-|ya29\.|1\/\/|4\/)[^\s]+/g, "[credencial omitida]")
        .replace(/[\x00-\x1f\x7f]/g, " ").slice(0,400);
      throw new Error(`Google rechazó el intercambio del código por el token (${code}; HTTP ${r.status}). Detalle: ${detail}`);
    }
    if(data.scope && !data.scope.split(" ").includes(SCOPE)) throw new Error("Falta autorizar el permiso de Google Fotos.");
    return data.access_token;
  } finally {clearTimeout(timer);signal.removeEventListener("abort",abort);server.close();server.closeAllConnections?.();}
}
async function importPhotos({openExternal,destination,signal,onStatus=()=>{},fetcher=fetch,secret}) {
  let token, session;
  const downloaded=[], failures=[];
  const api = async (route,method="GET",body,cleanup=false)=>{
    const r=await fetcher("https://photospicker.googleapis.com/v1/"+route,{method,headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:body ? JSON.stringify(body):undefined,signal:cleanup?AbortSignal.timeout(5000):AbortSignal.any([signal,AbortSignal.timeout(30000)])});
    if(!r.ok) throw new Error(`Google Fotos respondió HTTP ${r.status}. Revisá que la API esté habilitada y tu cuenta esté en usuarios de prueba.`);
    return r.status===204 ? {} : r.json();
  };
  try {
    onStatus("Iniciá sesión en el navegador…");
    token=await authorize({openExternal,signal,fetcher,secret});
    session=await api("sessions","POST",{});
    if(!session.id) throw new Error("Google no creó una sesión de selección.");
    await openExternal(trusted(session.pickerUri,"picker"));
    onStatus("Elegí fotos o videos en Google Fotos y presioná Listo. Después volvé a Film Lab.");
    const deadline=Date.now()+Math.min(seconds(session.pollingConfig?.timeoutIn,600000),1800000);
    while(!session.mediaItemsSet){
      if(Date.now()>deadline) throw new Error("La selección venció. Volvé a abrir Google Fotos.");
      await delay(Math.max(1000,seconds(session.pollingConfig?.pollInterval,5000)),undefined,{signal});
      session=await api("sessions/"+encodeURIComponent(session.id));
    }
    const items=[];
    let next="";
    do{
      const q=new URLSearchParams({sessionId:session.id,pageSize:"100"});if(next)q.set("pageToken",next);
      const page=await api("mediaItems?"+q);items.push(...(page.mediaItems||[]));next=page.nextPageToken||"";
    }while(next);
    await fs.mkdir(destination,{recursive:true});
    for(const [index,item] of items.entries()){
      signal.throwIfAborted();
      let output;
      try{
        const media=item.mediaFile;
        if(!media || !["PHOTO","VIDEO"].includes(item.type)) throw new Error("Formato no compatible");
        if(item.type==="VIDEO" && media.mediaFileMetadata?.videoMetadata?.processingStatus && media.mediaFileMetadata.videoMetadata.processingStatus!=="READY") throw new Error("El video todavía está procesándose en Google Fotos");
        onStatus(`Descargando ${index+1} de ${items.length}: ${safeName(media.filename)}`);
        const url=trusted(media.baseUrl,"media")+(item.type==="VIDEO"?"=dv":"=d");
        const r=await fetcher(url,{headers:{Authorization:`Bearer ${token}`},redirect:"error",signal:AbortSignal.any([signal,AbortSignal.timeout(1800000)])});
        if(!r.ok || !r.body) throw new Error(`Descarga HTTP ${r.status}`);
        const mime=(r.headers.get("content-type")||media.mimeType||"").split(";")[0];
        const ext=({"image/jpeg":".jpg","image/png":".png","image/webp":".webp","image/tiff":".tif","video/mp4":".mp4","video/quicktime":".mov","video/webm":".webm"})[mime];
        if(!ext) throw new Error("Google entregó un formato no compatible: "+mime);
        const name=path.parse(safeName(media.filename)).name+ext;
        output=path.join(destination,crypto.randomUUID()+"-"+name);
        const handle=await fs.open(output+".part","wx");
        await pipeline(Readable.fromWeb(r.body),handle.createWriteStream(),{signal});
        await fs.rename(output+".part",output);downloaded.push(output);
      }catch(e){if(output)await fs.rm(output+".part",{force:true});if(signal.aborted)break;failures.push(safeName(item.mediaFile?.filename)+": "+e.message);}
    }
    return {paths:downloaded,failures,canceled:signal.aborted};
  } finally {if(token && session?.id) await api("sessions/"+encodeURIComponent(session.id),"DELETE",null,true).catch(()=>{});token=null;}
}
module.exports={authorize,importPhotos,trusted,safeName,seconds,CLIENT_ID};
