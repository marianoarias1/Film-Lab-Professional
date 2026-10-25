import {normalizeSettings} from './engine.js';
const creator='@shadovisuals';
const creatorUrl='https://www.instagram.com/shadovisuals/';
const hsl=entries=>Array.from({length:8},(_,i)=>({h:0,s:0,l:0,...entries[i]}));
// Transcribed from the five FUJISTYLE cards provided by the user. They contain
// rendered examples, not matching unprocessed originals or calibration targets.
// Keep camera values separate from the hand-graded Film Lab interpretation.
function reference(id,name,description,original,settings,palette){
 return {id,name,creator:creator+' · Fujifilm',type:'adapted',description,source:creatorUrl,sourceLabel:'Ver creador ↗',palette,
  original:{name,source_attribution:creator,source_url:creatorUrl,reference_origin:'Captura FUJISTYLE aportada por el usuario',exposure_compensation:0,iso:null,...original},
  adaptation:{version:1,method:'Ajuste individual de tono y color sobre imágenes sRGB; no conversión numérica directa ni perfil oficial Fujifilm.',limitations:'El balance Auto depende de la toma. DR200/DR400 no recuperan luces recortadas en un JPEG. Las simulaciones Fuji, el grano, la nitidez y la reducción de ruido no tienen equivalencia exacta en este motor.'},
  settings:normalizeSettings(settings)};
}
export const fujiReferenceRecipes=[
 reference('shado-classic-mystical','ClassicMystical','Verdes oliva, rojos profundos y luces suaves.',{
  film_simulation:'CLASSIC Neg.',white_balance:'Auto',white_balance_red:3,white_balance_blue:-2,dynamic_range:'DR200',grain_roughness:'Weak',grain_size:'Small',color_chrome_effect:'Strong',color_chrome_fx_blue:'Strong',color:4,sharpness:-2,highlight:-1,shadow:-.5,high_iso_nr:-4,clarity:-1
 },{contrast:14,highlights:-14,shadows:6,temperature:15,tint:2,saturation:15,vibrance:8,grain:14,grainSize:1,sharpness:-16,clarity:-6,colorChrome:65,blueChrome:65,
  curve:[.008,.21,.50,.79,.985],hsl:hsl({0:{h:-3,s:7,l:-4},1:{h:-2,s:-3,l:2},2:{h:8,s:-15,l:-2},3:{h:-10,s:-18,l:-8},4:{h:3,s:-12},5:{h:-4,s:-12,l:2}})
 },['#57624e','#d8c6b0','#aa9e7a']),
 reference('shado-chrome-baby','Chrome for me Baby','Calidez de piedra, color contenido y sombras abiertas.',{
  film_simulation:'CLASSIC CHROME',white_balance:'Auto',white_balance_red:5,white_balance_blue:-6,dynamic_range:'DR200',grain_roughness:'Weak',grain_size:'Small',color_chrome_effect:'Strong',color_chrome_fx_blue:'Strong',color:3,sharpness:0,highlight:-2,shadow:-1.5,high_iso_nr:-4,clarity:-4
 },{contrast:6,highlights:-27,shadows:19,temperature:27,tint:-2,saturation:2,vibrance:4,grain:14,grainSize:1,clarity:-24,colorChrome:65,blueChrome:65,
  curve:[.008,.22,.49,.77,.975],hsl:hsl({0:{s:-6},1:{h:2,s:-7,l:2},2:{h:-7,s:-18,l:1},3:{h:-12,s:-28,l:-3},4:{h:5,s:-22},5:{h:-5,s:-24,l:5}})
 },['#ac9972','#50392b','#d7c0a6']),
 reference('shado-albuquerque-35','Albuquerque 35','Luces ámbar, tierra dorada y sombras densas.',{
  film_simulation:'NOSTALGIC Neg.',white_balance:'Fluorescent 1',white_balance_red:-4,white_balance_blue:-2,dynamic_range:'DR400',grain_roughness:'Weak',grain_size:'Small',color_chrome_effect:'Strong',color_chrome_fx_blue:'Off',color:4,sharpness:0,highlight:-2,shadow:1,high_iso_nr:-4,clarity:-2
 },{contrast:12,highlights:-24,shadows:-13,temperature:9,tint:-9,saturation:14,vibrance:8,grain:14,grainSize:1,clarity:-12,colorChrome:65,blueChrome:0,
  curve:[.009,.19,.49,.80,.98],hsl:hsl({0:{h:3,s:-3,l:-3},1:{h:4,s:8,l:2},2:{h:-10,s:7,l:-2},3:{h:-16,s:-24,l:-9},4:{h:5,s:-12,l:3},5:{h:-7,s:-20,l:6}})
 },['#b79b64','#d7b269','#93a9b0']),
 reference('shado-acros-gray-matter','AcrosGrayMatter','Blanco y negro intenso, cielos oscuros y grano fino.',{
  film_simulation:'ACROS+R FILTER',white_balance:'Auto',white_balance_red:4,white_balance_blue:-6,dynamic_range:'Auto',grain_roughness:'Weak',grain_size:'Small',color_chrome_effect:'Off',color_chrome_fx_blue:'Off',color:0,sharpness:3,highlight:-1.5,shadow:3.5,high_iso_nr:0,clarity:-2
 },{mono:1,contrast:22,highlights:-18,shadows:-34,blacks:-5,grain:14,grainSize:1,sharpness:24,clarity:-12,
  curve:[0,.18,.49,.80,.99],hsl:hsl({0:{l:15},1:{l:9},2:{l:-5},3:{l:-24},4:{l:-30},5:{l:-42},6:{l:-18}})
 },['#a1a19d','#484947','#d4d3cc']),
 reference('shado-dream-cars-astia','DreamCarsAstia','Metal frío, blancos claros y negros definidos, sin grano.',{
  film_simulation:'ASTIA/SOFT',white_balance:'Kelvin',wb_kelvin:5700,white_balance_red:-1,white_balance_blue:1,dynamic_range:'DR200',grain_roughness:'Off',grain_size:'Small',color_chrome_effect:'Weak',color_chrome_fx_blue:'Off',color:4,sharpness:2,highlight:1,shadow:2,high_iso_nr:-2,clarity:2
 },{contrast:12,highlights:10,shadows:-23,blacks:-4,temperature:-4,saturation:17,vibrance:6,grain:0,grainSize:1,sharpness:16,clarity:12,denoise:6,colorChrome:25,
  curve:[0,.22,.51,.81,1],hsl:hsl({0:{s:5,l:-3},1:{s:-3,l:1},2:{s:-15},3:{s:-18,l:-6},4:{s:-14},5:{h:-3,s:-10,l:2}})
 },['#717d7b','#d2cbc0','#242b29'])
];
export function fujiReferenceRows(recipe){
 const r=recipe.original;if(!r)return [];
 return [['Autor',r.source_attribution],['Simulación',r.film_simulation],['Balance de blancos',r.white_balance+(r.wb_kelvin?' · '+r.wb_kelvin+' K':'')],['Desplazamiento rojo',r.white_balance_red],['Desplazamiento azul',r.white_balance_blue],['Rango dinámico',r.dynamic_range],['Grano · intensidad',r.grain_roughness],['Grano · tamaño',r.grain_size],['Color Chrome',r.color_chrome_effect],['Color Chrome FX Blue',r.color_chrome_fx_blue],['Color',r.color],['Nitidez',r.sharpness],['Altas luces',r.highlight],['Sombras',r.shadow],['Reducción de ruido ISO',r.high_iso_nr],['Claridad',r.clarity],['Compensación de exposición',r.exposure_compensation+' EV'],['ISO',r.iso??'No indicado en la referencia']];
}

