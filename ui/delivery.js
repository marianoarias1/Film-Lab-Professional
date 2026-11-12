export const deliveryDefaults = () => ({width:0,height:0,fit:'contain',cropX:.5,cropY:.5,upscale:false,jpegQuality:95});
export const deliveryPresets = {
  original: {...deliveryDefaults()},
  reel: {width:1080,height:1920,fit:'cover',jpegQuality:90},
  portrait: {width:1080,height:1350,fit:'cover',jpegQuality:90},
  square: {width:1080,height:1080,fit:'cover',jpegQuality:90},
  landscape: {width:1920,height:1080,fit:'contain',jpegQuality:95},
};
export function mountDelivery() {
  const $ = id => document.getElementById(id), keys = Object.keys(deliveryDefaults());
  function read() {
    return Object.fromEntries(keys.map(k => [k,k==='jpegQuality' && $('photoFormat').value !== 'jpg' ? 95 : k==='fit'?$('delivery-'+k).value:k==='upscale'?$('delivery-'+k).checked:Number($('delivery-'+k).value)]));
  }
  function info() {
    const d = read();
    $('deliveryInfo').textContent = d.width && d.height
      ? `${d.width} × ${d.height} px · ${d.fit==='cover'?'recorte para llenar':'foto completa con márgenes'}${d.upscale?'':' · sin ampliar fotos pequeñas'}`
      : 'Se conserva el tamaño de cada fotografía.';
    $('jpegQualityField').hidden = $('photoFormat').value !== 'jpg';
    $('delivery-jpegQuality').disabled = $('photoFormat').value !== 'jpg';
  }
  function set(values) {
    for (const [key,value] of Object.entries({...deliveryDefaults(),...values})) {
      const el=$('delivery-'+key);
      if(key==='upscale') el.checked=value; else el.value=value;
    }
    info();
  }
  $('deliveryPreset').onchange=()=>{
    if($('deliveryPreset').value!=='original') $('photoFormat').value='jpg';
    set(deliveryPresets[$('deliveryPreset').value]);
  };
  $('photoFormat').addEventListener('change',info);
  keys.forEach(k=>$('delivery-'+k).addEventListener('input',info));
  set(deliveryDefaults()); return {read};
}
