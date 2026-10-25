export function durationLabel(seconds) {
  if(!Number.isFinite(seconds)||seconds<0)return 'Calculando…';
  const s=Math.ceil(seconds);return s>=60?`${Math.floor(s/60)} min ${s%60} s`:`${s} s`;
}
export function progressView(p) {
  const raw=Number(p.fraction);const fraction=Number.isFinite(raw)?Math.max(0,Math.min(p.committed?1:.99,raw)):0;
  const count=p.fileTotal>1?`Archivo ${p.fileIndex+1} de ${p.fileTotal}`:'Archivo actual';
  const phase=p.kind==='photo'?(p.committed?'Foto guardada':'Procesando foto'):p.phase==='retry'?'Reiniciando con CPU':p.phase==='finalizing'?'Finalizando archivo':p.phase==='preparing'?'Preparando video':p.committed?'Archivo guardado':'Procesando video';
  const encoder=p.kind==='photo'?'Procesamiento CPU · float32':p.encoder==='NVENC'?'Codificación NVIDIA NVENC':p.encoder==='CPU'?'Codificación CPU':'Comprobando NVENC';
  const fps=p.kind==='photo'?'':Number.isFinite(p.fps)&&p.fps>0?`${p.fps.toFixed(1)} fotogramas/s`: 'Calculando velocidad…';
  const speed=Number.isFinite(p.realtimeSpeed)&&p.realtimeSpeed>0?` · ${p.realtimeSpeed.toFixed(2)}× tiempo real`:'';
  const eta=p.kind==='photo'?'':p.phase==='finalizing'?'Terminando audio y contenedor':`Restante para este video: ${durationLabel(p.etaSeconds)}`;
  return {fraction,headline:`${count} · ${Math.floor(fraction*100)} % · ${phase}`,filename:p.fileName||'',encoder,speed:fps+speed,eta,elapsed:`Transcurrido: ${durationLabel(p.elapsedSeconds)}`,fallback:p.fallbackReason||''};
}
