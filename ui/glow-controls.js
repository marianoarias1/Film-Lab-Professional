// Existing gesture-aware sliders retain one undo step per drag.
export function drawGlowControls({current,busy,slider,commitEdit,edited,drawControls}) {
 const box=document.getElementById('glowControls'),file=current();box.replaceChildren();
 const node=(tag,props={},text)=>{const n=Object.assign(document.createElement(tag),props);if(text!==undefined)n.textContent=text;return n;};
 if(!file){box.append(node('p',{className:'help'},'Abrí una foto o un video para agregar resplandor.'));return;}
 const s=file.settings.glow;
 const change=fn=>{const old=structuredClone(file.settings);fn();file.recipe=null;commitEdit(file,old);edited();drawControls();};
 const label=node('label',{className:'help'}),toggle=node('input',{type:'checkbox',checked:s.enabled,disabled:busy});
 toggle.onchange=()=>change(()=>s.enabled=toggle.checked);label.append(toggle,document.createTextNode(' Activar resplandor'));box.append(label);
 const controls=node('fieldset',{disabled:busy||!s.enabled,className:'glow-fields'});
 const styleLabel=node('label',{},'Estilo'),style=node('select',{'ariaLabel':'Estilo de resplandor'});
 for(const [value,name] of [['soft','Suave'],['directional','Direccional']])style.append(node('option',{value,selected:s.style===value},name));
 style.onchange=()=>change(()=>s.style=style.value);styleLabel.append(style);controls.append(styleLabel);
 for(const def of [['amount','Intensidad',0,100],['range','Rango de luces',0,100],['spread','Extensión',0,100],...(s.style==='directional'?[['angle','Dirección',-180,180,1,'°']]:[]),['temperature','Temperatura',-100,100]])controls.append(slider(['glow.'+def[0],...def.slice(1)],'glow'));
 const maskLabel=node('label',{},'Dónde aplicar'),mask=node('select',{'ariaLabel':'Zona de resplandor'});
 mask.append(node('option',{value:'',selected:s.maskId==null},'Toda la foto'));
 for(const m of file.settings.masks||[])mask.append(node('option',{value:m.id,selected:s.maskId===m.id},m.name+(m.visible?'':' · oculta')));
 if(s.maskId!=null&&!(file.settings.masks||[]).some(m=>m.id===s.maskId))mask.append(node('option',{value:s.maskId,selected:true},'Máscara eliminada · elegí otra zona'));
 mask.onchange=()=>change(()=>s.maskId=mask.value===''?null:Number(mask.value));maskLabel.append(mask);controls.append(maskLabel);
 controls.append(node('p',{className:'help'},'Un rango mayor incluye más luces. La máscara limita dónde aparece el resplandor.'));
 box.append(controls);
}
