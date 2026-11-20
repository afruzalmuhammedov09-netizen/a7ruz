/* CYH I: geolocated OSM trees + woodland coverage from OpenFreeMap vector tiles.
   Explicit tree points are geographic; woodland trees are representative, NOT surveyed stems. */
import { VectorTile } from 'https://esm.sh/@mapbox/vector-tile@2.0.4';
import Pbf from 'https://esm.sh/pbf@4.0.1';
const Z=14,N=2**Z,treePoints=new Map(),woodAreas=new Map(),tileCache=new Map();
let busy=false,lastCity='',lastTile='',failures=0;
const pointCells=new Map(), POINT_CELL=.025;
let pointBusy=false, pointStatus='';
// Jizzax starter points from the OpenStreetMap map API (ODbL).
const jizzaxTrees=[[9728326584,67.8272176,40.1255954],[9778387161,67.823246,40.1125428],[9778387162,67.823107,40.1125331],[9778387167,67.8233855,40.1127494],[10039545141,67.823657,40.1106754],[10039545142,67.8236365,40.1106277],[10913660433,67.8323069,40.1146482],[10913660434,67.8322446,40.1146338],[10913660435,67.8324209,40.1146569],[10913660436,67.8323632,40.1146446],[10913660437,67.8323974,40.1145789],[10913660438,67.8324269,40.1145841],[10913660439,67.8324551,40.1145902],[10913660440,67.8324665,40.1145671],[10913660441,67.832439,40.1145605],[10913660442,67.8324075,40.1145523],[10913660443,67.8324759,40.1145487],[10913660444,67.8324477,40.11454],[10913660445,67.8324169,40.1145328],[10913660446,67.8324846,40.1145261],[10913660447,67.8324565,40.1145184],[10913660448,67.8324276,40.1145112],[10913660449,67.8324672,40.1144984],[10913660450,67.8324363,40.1144923],[10913660451,67.8324947,40.1145046]].map(([id,lon,lat])=>({type:'node',id,lon,lat,tags:{natural:'tree'}}));
function applySurveyedTrees(elements,c){
 let changed=false;
 for(const node of elements){
  if(node.type!=='node'||node.tags?.natural!=='tree'||!Number.isFinite(node.lon)||!Number.isFinite(node.lat))continue;
  const [x,z]=toLocal(node.lon,node.lat,c),key='p'+Math.round(x)+'/'+Math.round(z);
  const prior=treePoints.get(key);
  if(prior&&prior.id===node.id)continue;
  treePoints.set(key,{x,z,exact:true,id:node.id});
  changed=true;
 }
 if(changed)window.CYH_TREE_REBUILD?.();
}
async function syncSurveyedTrees(c,force){
 if(pointBusy)return;
 const lat=c.lat+c.z/111320,lon=c.lon+c.x/(111320*Math.cos(c.lat*Math.PI/180));
 const y=Math.floor(lat/POINT_CELL),x=Math.floor(lon/POINT_CELL);
 const key=c.city+'/'+x+'/'+y;
 const cached=pointCells.get(key);
 if(cached?.elements){
  applySurveyedTrees(cached.elements,c);
  pointStatus='';
  return;
 }
 if(!force&&cached?.retryAt>Date.now())return;
 pointBusy=true;
 pointStatus=' • aniq nuqtalar yuklanmoqda';updateStatus();
 const bbox=[(y-.2)*POINT_CELL,(x-.2)*POINT_CELL,(y+1.2)*POINT_CELL,(x+1.2)*POINT_CELL].map(n=>n.toFixed(5)).join(',');
 const query='[out:json][timeout:10];node["natural"="tree"]('+bbox+');out body;';
 try{
  for(const endpoint of ['https://overpass-api.de/api/interpreter','https://overpass.private.coffee/api/interpreter']){
   try{
    const response=await fetch(endpoint+'?data='+encodeURIComponent(query),{signal:AbortSignal.timeout(13000)});
    if(!response.ok)continue;
    const data=await response.json();
    if(!Array.isArray(data.elements)||data.remark)continue;
    if(pointCells.size>=100)pointCells.delete(pointCells.keys().next().value);
    pointCells.set(key,{elements:data.elements});
    if(ctx()?.city===c.city)applySurveyedTrees(data.elements,c);
    pointStatus='';
    return;
   }catch(error){console.warn('OSM tree points:',error.message)}
  }
  pointCells.set(key,{retryAt:Date.now()+5*60*1000});
  pointStatus=' • OSM nuqtalari vaqtincha olinmadi';
 }finally{
  pointBusy=false;updateStatus();
 }
}
function ctx(){return window.CYH_REAL_ROAD_CONTEXT?.()}
function coords(lon,lat){return {x:(lon+180)/360*N,y:(1-Math.log(Math.tan(lat*Math.PI/180)+1/Math.cos(lat*Math.PI/180))/Math.PI)/2*N}}
function toLocal(lon,lat,c){return [(lon-c.lon)*111320*Math.cos(c.lat*Math.PI/180),(lat-c.lat)*111320]}
function pointInside(x,y,r){let hit=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[i],b=r[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])hit=!hit}return hit}
function hash(a,b){let h=(Math.imul((a*11)|0,374761393)^Math.imul((b*19)|0,668265263))|0;h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967295}
async function getTile(tx,ty){
 const k=Z+'/'+tx+'/'+ty;if(tileCache.has(k))return tileCache.get(k);
 const promise=(async()=>{
 const r=await fetch('https://tiles.openfreemap.org/planet/latest/'+k+'.pbf');
 if(!r.ok)throw Error('tile '+r.status);
 const t=new VectorTile(new Pbf(new Uint8Array(await r.arrayBuffer())));
 const trees=[],woods=[];
 const poi=t.layers.poi;
 if(poi)for(let i=0;i<poi.length&&i<4000;i++){
  const f=poi.feature(i);if(f.type!==1)continue;
  const props=f.properties||{},kind=(props.class||'')+' '+(props.subclass||'');
  if(!/(^|\s)tree(\s|$)/.test(kind))continue;
  const g=f.toGeoJSON(tx,ty,Z).geometry;
  if(g?.type==='Point')trees.push(g.coordinates);
  if(g?.type==='MultiPoint')trees.push(...g.coordinates);
 }
 const land=t.layers.landcover;
 if(land)for(let i=0;i<land.length&&i<600;i++){
  const f=land.feature(i),p=f.properties||{},className=p.class||'',sub=p.subclass||'';
  if(f.type!==3||!(className==='wood'||sub==='forest'||sub==='wood'||sub==='orchard'))continue;
  const g=f.toGeoJSON(tx,ty,Z).geometry;if(!g)continue;
  if(g.type==='Polygon')woods.push(...g.coordinates.slice(0,1));
  else if(g.type==='MultiPolygon')for(const polygon of g.coordinates)woods.push(...polygon.slice(0,1));
 }
 return {trees,woods};
 })();
 tileCache.set(k,promise);
 try{return await promise}catch(e){tileCache.delete(k);throw e}
}
function updateStatus(){
 const count=treePoints.size,woods=woodAreas.size;
 const el=document.getElementById('treeLiveStatus');
 if(el)el.textContent='DARAXTLAR: '+count+' xaritadagi nuqta • '+woods+' taxminiy o‘rmon hududi'+pointStatus+(busy?' • yuklanmoqda':'');
}
function applyTile(data,city,c,tx,ty){
 for(let i=0;i<data.trees.length;i++){
  const [lon,lat]=data.trees[i],p=toLocal(lon,lat,c),key='p'+Math.round(p[0])+'/'+Math.round(p[1]);
  if(window.CYH_TERRAIN&&!CYH_TERRAIN.inside(p[0],p[1]))continue;
  if(!treePoints.has(key))treePoints.set(key,{x:p[0],z:p[1],exact:true});
 }
 for(let i=0;i<data.woods.length;i++){
  const poly=data.woods[i].map(p=>toLocal(p[0],p[1],c));
  if(poly.length<3)continue;
  woodAreas.set(tx+'/'+ty+'/'+i,poly);
 }
}
function getChunkTrees(cx,cz){
 const trees=[],minx=cx*160,minz=cz*160,maxx=minx+160,maxz=minz+160;
 for(const item of treePoints.values())if(item.x>=minx&&item.x<maxx&&item.z>=minz&&item.z<maxz)trees.push(item);
 if(trees.length>=90)return trees;
 // OSM woodland boundaries are real, individual stem coordinates are not: synthesize only inside woodland.
 for(const poly of woodAreas.values()){
  const bx0=Math.max(minx,Math.min(...poly.map(p=>p[0]))),bx1=Math.min(maxx,Math.max(...poly.map(p=>p[0])));
  const bz0=Math.max(minz,Math.min(...poly.map(p=>p[1]))),bz1=Math.min(maxz,Math.max(...poly.map(p=>p[1])));
  if(bx0>=bx1||bz0>=bz1)continue;
  const spacing=23;for(let x=Math.floor(bx0/spacing)*spacing;x<bx1;x+=spacing)for(let z=Math.floor(bz0/spacing)*spacing;z<bz1;z+=spacing){
   const xx=x+(hash(x,z)-.5)*12,zz=z+(hash(z,x)-.5)*12;
   if(xx<minx||xx>=maxx||zz<minz||zz>=maxz||!pointInside(xx,zz,poly))continue;
   if(treePoints.has('p'+Math.round(xx)+'/'+Math.round(zz)))continue;
   if(window.CYH_TERRAIN&&!CYH_TERRAIN.inside(xx,zz))continue;
   trees.push({x:xx,z:zz,exact:false});
   if(trees.length>=90)return trees;
  }
 }
 return trees;
}
async function sync(force=false){
 const c=ctx();if(!c)return;
 const {city,lon,lat,x,z}=c;
 if(city!==lastCity){treePoints.clear();woodAreas.clear();lastCity=city;lastTile='';pointStatus='';if(city==='Jizzax')applySurveyedTrees(jizzaxTrees,c)}
 void syncSurveyedTrees(c,force);
 if(busy)return;
 const ll=coords(lon+x/(111320*Math.cos(lat*Math.PI/180)),lat+z/111320);
 const tx=Math.floor(ll.x),ty=Math.floor(ll.y),id=city+'/'+tx+'/'+ty;
 if(!force&&id===lastTile)return;
 busy=true;updateStatus();
 try{
  const locations=[];for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)locations.push([tx+dx,ty+dy]);
  const vals=await Promise.allSettled(locations.map(([a,b])=>getTile(a,b)));
  if(ctx()?.city!==city)return;
  let received=0;for(let i=0;i<vals.length;i++)if(vals[i].status==='fulfilled'){
   applyTile(vals[i].value,city,c,...locations[i]);received++;
  }else failures++;
  if(received){lastTile=id;window.CYH_TREE_REBUILD?.()}
  else console.warn('Daraxt qatlamlari yuklanmadi');
 }finally{busy=false;updateStatus()}
}
window.CYH_TREE_DATA={getChunkTrees,sync,status:()=>({points:treePoints.size,woods:woodAreas.size,failures})};

// CYH_AUTO_SCENE_START: load visible map objects without a manual button.
let cyhAutoStarted=false;
function cyhAutoSceneTick(){
 if(!window.CYH_REAL_ROAD_CONTEXT?.())return;
 cyhAutoStarted=true;
 sync().catch(error=>console.warn('CYH automatic scene:',error));
}
cyhAutoSceneTick();
const cyhAutoInit=setInterval(()=>{
 cyhAutoSceneTick();
 if(cyhAutoStarted)clearInterval(cyhAutoInit);
},1200);
setInterval(cyhAutoSceneTick,7000);
// CYH_AUTO_SCENE_END
