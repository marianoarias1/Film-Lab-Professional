import {fileURLToPath} from 'node:url';
import path from 'node:path';
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
import fs from 'node:fs';
import {builtins,editorialLooks} from './web-reference/recipes.js';
import catalog from './web-reference/catalog.json' with {type:'json'};
import {retiredRecipes} from './web-reference/catalog-curation.js';
import {recipeRecommendation} from './web-reference/recipe-discovery.js';
import {normalizePoints,sampleCurve} from './web-reference/curve.js';
const all=[...builtins,...editorialLooks,...catalog.recipes],clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const recipes=all.map(r=>{
 const w=r.settings,s={};for(const key of ['exposure','contrast','highlights','shadows','whites','blacks','temperature','tint','saturation','vibrance','clarity','denoise','vignette','grain'])if(Number.isFinite(w[key]))s[key]=w[key];
 s.mono=!!w.mono;s.sharpness=Math.max(0,w.sharpness||0);
 if(w.sharpness<0){s.denoise=clamp((s.denoise||0)-w.sharpness*.5,0,100);s.texture=clamp((s.texture||0)+w.sharpness*.25,-100,100);}
 s.grainSize=clamp(25+((w.grainSize||1)-1)*15,0,100);
 s.hsl=Array.from({length:8},(_,i)=>{const c=w.hsl?.[i]||{};return [clamp((c.h||0)*100/30,-100,100),c.s||0,clamp((c.l||0)-(w.colorChrome||0)*.12-(i===5?(w.blueChrome||0)*.18:i===4?(w.blueChrome||0)*.05:0),-100,100)];});
 const points=normalizePoints(w.curvePoints,w.curve),gamma=2**(-(w.gamma||0)/150),fade=Math.max(0,w.fade||0)/100*.18;
 const adjusted=(w.gamma||w.fade)?Array.from({length:17},(_,i)=>{const x=i/16;return[x,clamp(sampleCurve(x**gamma,points)*(1-fade*1.4)+fade,0,1)];}):points.map(p=>[p.x,p.y]);
 s.curve=adjusted;
 const recommendation=recipeRecommendation(r);
 return {...r,settings:s,webSettings:w,hiddenFromCatalog:!!r.hiddenFromCatalog||!!retiredRecipes[r.id],replacementId:retiredRecipes[r.id]||null,recommendation,
  sky:r.palette?.[0]||'#b1c6cc',earth:r.palette?.[1]||'#6f806b',adaptation:{...r.adaptation,professionalVersion:1,method:'Interpretación de los ajustes web mediante LightCraft. Se conservan nombre, autor y referencia; la apariencia no es idéntica entre motores.',notes:['HSL y Color Chrome se interpretan con el mezclador perceptual; los centros y pesos difieren.','Gamma, desvanecido y curva se componen en una curva tonal; el suavizado negativo se aproxima con detalle y ruido.','Las simulaciones Fujifilm siguen siendo interpretaciones; no son perfiles oficiales ni revelados calibrados.']}};
});
const result={schemaVersion:1,sourceRepository:'marianoarias1/film-lab',sourceCommit:'59d7fedb3a5b5a57d27f08c0fe4e310a58c78a15',retrievedAt:'2026-10-24',visibleCount:recipes.filter(r=>!r.hiddenFromCatalog).length,recipes};
fs.mkdirSync(path.join(project,'ui/catalog'),{recursive:true});fs.writeFileSync(path.join(project,'ui/catalog/web-recipes.json'),JSON.stringify(result,null,2)+'\n');
console.log(result.visibleCount,'visible recipes;',recipes.length,'including retired references');console.log('curve',JSON.stringify(recipes[0].settings.curve));

fs.writeFileSync(path.join(project,'ui/catalog/web-recipes.js'),'// Snapshot of Film Lab web '+result.sourceCommit+'; attribution and source settings retained.\nexport default '+JSON.stringify(result,null,2)+';\n');
