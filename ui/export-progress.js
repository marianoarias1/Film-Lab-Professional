export function durationLabel(seconds) {
  if(!Number.isFinite(seconds)||seconds<0)return 'Calculando…';
  const s=Math.ceil(seconds);return s>=60?`${Math.floor(s/60)} min ${s%60} s`:`${s} s`;
}
export function progressView(p) {
  const raw=Number(p.fraction), fraction=Number.isFinite(raw)?Math.max(0,Math.min(p.committed?1:.99,raw)):0;
  const count=p.fileTotal>1?`Foto ${p.fileIndex+1} de ${p.fileTotal}`:'Foto actual';
  const phase=p.committed?'Foto guardada':p.phase==='finalizing'?'Guardando fotografía':'Procesando fotografía';
  return {fraction,headline:`${count} · ${Math.floor(fraction*100)} % · ${phase}`,filename:p.fileName||'',encoder:'',speed:'',eta:'',elapsed:`Transcurrido: ${durationLabel(p.elapsedSeconds)}`,fallback:''};
}
