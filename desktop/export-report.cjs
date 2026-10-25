const os = require('node:os');
const {atomicWrite} = require('./project-store.cjs');
function makeReport({name,kind,result,status='completed',error=null,openMs=0,wallMs=0,redact=[]}) {
  const report = {
    schemaVersion:1, appVersion:'0.4.0', createdAt:new Date().toISOString(),
    fileName:name,kind,status,error,
    host:{platform:process.platform,arch:process.arch,cpu:os.cpus()[0]?.model||'unknown',logicalProcessors:os.availableParallelism(),ramBytes:os.totalmem()},
    timings:{openMs,desktopWallMs:wallMs},
    export:result?.diagnostics||result||null,
    notes:['Los tiempos acumulados de etapas pueden superponerse; no deben sumarse como tiempo total.','El informe no contiene fotos, video ni rutas de los originales.','NVENC acelera la codificación. Los ajustes de LightCraft siguen usando CPU.'],
  };
  // Redact known local paths even when upstream errors include a filename.
  let json=JSON.stringify(report);
  for(const value of [...redact].filter(Boolean).sort((a,b)=>b.length-a.length)) json=json.split(JSON.stringify(value).slice(1,-1)).join("[ruta local]");
  return JSON.parse(json);
}
async function keepReport(file,report) { await atomicWrite(file,report); }
module.exports={makeReport,keepReport};
