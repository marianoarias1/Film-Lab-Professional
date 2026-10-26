const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');
const geometry=fs.readFile('ui/mask-geometry.js','utf8').then(s=>import('data:text/javascript;base64,'+Buffer.from(s).toString('base64')));
const near=(a,b)=>assert(Math.abs(a-b)<1e-6,`${a} != ${b}`);
test('radial drawn in either direction keeps center, size and pixel aspect',async()=>{
 const {createShape,shapeAlpha}=await geometry,b={width:800,height:400};
 const a=createShape('radial',{x:100,y:100},{x:500,y:300},b),z=createShape('radial',{x:500,y:300},{x:100,y:100},b);
 assert.deepEqual(a,z);near(a.center.x,.375);near(a.rx,.25);near(a.ry,.125);
 near(shapeAlpha(a,300,200,b),1);near(shapeAlpha(a,500,200,b),0);
 assert(shapeAlpha(a,450,200,b)>0&&shapeAlpha(a,450,200,b)<1);
});
test('radial rotation preserves radii; center movement preserves rotation and size',async()=>{
 const {transformShape}=await geometry,b={width:800,height:400};
 const s={kind:'radial',center:{x:.5,y:.5},rx:.2,ry:.1,angle:0,feather:50};
 const rotated=transformShape(s,'rotate',{x:500,y:200},{x:400,y:300},b);near(rotated.angle,90);near(rotated.rx,.2);near(rotated.ry,.1);
 const moved=transformShape(rotated,'center',{x:400,y:200},{x:500,y:250},b);near(moved.center.x,.625);near(moved.center.y,.625);near(moved.angle,90);
 const resized=transformShape(rotated,'rx',{x:400,y:360},{x:400,y:280},b);near(resized.rx,.1);near(resized.ry,.1);
});
test('linear move, rotation and compression preserve midpoint/orientation as appropriate',async()=>{
 const {transformShape,linearGeometry,shapeAlpha}=await geometry,b={width:800,height:400},s={kind:'linear',start:{x:.5,y:.25},end:{x:.5,y:.75}};
 const moved=transformShape(s,'center',{x:400,y:200},{x:450,y:230},b);near(moved.start.y,.325);near(moved.end.y,.825);near(moved.start.x,.5625);
 const rotated=transformShape(s,'rotate',{x:500,y:200},{x:400,y:300},b),g=linearGeometry(rotated,b);near(g.center.x,400);near(g.center.y,200);near(g.half,100);near(g.n.y,0);
 const compressed=transformShape(s,'spread',{x:400,y:100},{x:400,y:170},b),c=linearGeometry(compressed,b);near(c.center.y,200);near(c.half,30);near(c.n.y,1);
 near(shapeAlpha(s,400,100,b),1);near(shapeAlpha(s,400,200,b),.5);near(shapeAlpha(s,400,300,b),0);
});
test('linear boundary constraints keep valid endpoints without changing translation angle',async()=>{
 const {transformShape}=await geometry,b={width:300,height:800},s={kind:'linear',start:{x:.2,y:.2},end:{x:.7,y:.7}};
 const moved=transformShape(s,'center',{x:0,y:0},{x:10000,y:10000},b);near(moved.end.x,1);near(moved.end.y,1);near(moved.end.x-moved.start.x,.5);near(moved.end.y-moved.start.y,.5);
 for(const p of Object.values(transformShape(s,'rotate',{x:100,y:100},{x:300,y:700},b)).filter(p=>p&&typeof p==='object'))for(const n of Object.values(p))assert(n>=0&&n<=1);
});
test('brush tint respects feather, density, erase order and single dab strokes',async()=>{
 const {brushAlpha}=await geometry,b={width:100,height:100},s={points:[{x:.5,y:.5}],size:.2,feather:50,flow:100,density:50,erase:false};
 const a=brushAlpha([s],b);near(a[50*100+50],.5);near(a[0],0);assert(a[50*100+68]>0&&a[50*100+68]<.5);
 const erased=brushAlpha([s,{...s,size:.1,density:100,feather:0,erase:true}],b);near(erased[50*100+50],0);assert(erased[50*100+65]>0);
 const repainted=brushAlpha([s,{...s,size:.1,density:100,feather:0,erase:true},{...s,size:.05,density:100}],b);near(repainted[50*100+50],1);
});
test('cached live brush matches full raster after appending, erasing and undo',async()=>{
 const {brushAlpha}=await geometry,b={width:80,height:120},cache={},s={points:[{x:.2,y:.3}],size:.1,feather:65,flow:40,density:80,erase:false},strokes=[s];
 for(let i=0;i<8;i++){s.points.push({x:.2+i*.02,y:.3+i*.04});assert.deepEqual(brushAlpha(strokes,b,cache),brushAlpha(strokes,b));}
 strokes.push({...s,points:[{x:.3,y:.5}],erase:true});assert.deepEqual(brushAlpha(strokes,b,cache),brushAlpha(strokes,b));
 strokes.pop();s.points.splice(3);assert.deepEqual(brushAlpha(strokes,b,cache),brushAlpha(strokes,b));
});
test('rotating an edge-bound linear mask never produces invalid coincident endpoints',async()=>{
 const {transformShape}=await geometry,b={width:800,height:400},s={kind:'linear',start:{x:.2,y:0},end:{x:.8,y:0}};
 const t=transformShape(s,'rotate',{x:500,y:0},{x:400,y:100},b);assert.deepEqual(t,s);
});
test('ordered compound coverage adds, subtracts and intersects zones',async()=>{
 const {combineAlpha,maskCoverage}=await geometry;
 near(combineAlpha(.3,.7,'add'),.7);near(combineAlpha(.3,.7,'subtract'),.09);near(combineAlpha(.3,.7,'intersect'),.21);
 const b={width:40,height:40},radial={kind:'radial',center:{x:.5,y:.5},rx:.35,ry:.35,angle:0,feather:0},linear={kind:'linear',start:{x:0,y:0},end:{x:1,y:0}},mask={invert:false,components:[{op:'add',shape:radial},{op:'subtract',shape:linear}]};
 const a=maskCoverage(mask,b),i=20*40+20;assert(a[i]>0&&a[i]<1);near(a[0],0);
 mask.components[1].op='intersect';const c=maskCoverage(mask,b);assert(c[i]>0&&c[i]<1);near(c[0],0);
 mask.invert=true;const d=maskCoverage(mask,b);near(d[i]+c[i],1);
 mask.components.push({op:'intersect',shape:{kind:'luminanceRange'}});assert.equal(maskCoverage(mask,b),null);
});
test('hover inspection isolates a zone without altering group state or its operation',async()=>{
 const {maskPreview,maskCoverage}=await geometry;
 const mask={id:1,invert:true,adjust:{exposure:1},components:[{op:'add',invert:false,shape:{kind:'linear',start:{x:0,y:0},end:{x:1,y:0}}},{op:'intersect',invert:false,shape:{kind:'radial',center:{x:.5,y:.5},rx:.2,ry:.2,angle:0,feather:30,invert:false}}]};
 const original=structuredClone(mask),view=maskPreview(mask,1);assert.equal(view.components.length,1);assert.equal(view.components[0].op,'add');assert.equal(view.invert,false);assert.equal(view.adjust,mask.adjust);
 assert.deepEqual(mask,original);assert.equal(maskPreview(mask,null),mask);
 const a=maskCoverage(view,{width:20,height:20});assert(a[10*20+10]>.9);near(a[0],0);
});
