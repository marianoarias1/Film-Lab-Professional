// Preview layout depends on the viewport and photo aspect, never on draft pixel count.
export function fittedPreview(width,height,aspect){
  if(!(width>0&&height>0&&aspect>0))return null;
  const w=Math.min(width,height*aspect);return {width:w,height:w/aspect};
}
export function colorTrack(key){
  if(['temperature','temp','leakTemperature'].includes(key))return 'linear-gradient(90deg,#79a9d0,#b8c3b8 50%,#f1c660)';
  if(key==='tint')return 'linear-gradient(90deg,#83af78,#bdc1b5 50%,#c28bc3)';
  if(['hue','shadowHue','highlightHue'].includes(key))return 'linear-gradient(90deg,#d47575,#d9b66a,#97bb6b,#6bbba2,#6d9fc9,#a58bc3,#d475a1,#d47575)';
  const match=/^hsl\.(\d)\.0$/.exec(key);
  if(match){const h=[0,30,60,120,180,240,280,320][Number(match[1])];if(h!==undefined)return `linear-gradient(90deg,hsl(${h-35} 55% 65%),hsl(${h} 55% 65%),hsl(${h+35} 55% 65%))`;}
  return null;
}
