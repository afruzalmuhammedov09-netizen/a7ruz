/* CYH I: geolocated OSM trees + woodland coverage from OpenFreeMap vector tiles.
   Explicit tree points are geographic; woodland trees are representative, NOT surveyed stems. */
import { VectorTile } from 'https://esm.sh/@mapbox/vector-tile@2.0.4';
import Pbf from 'https://esm.sh/pbf@4.0.1';
const Z=14,N=2**Z,treePoints=new Map(),woodAreas=new Map(),tileCache=new Map();
let busy=false,lastCity='',lastTile='',pendingCity='',failures=0;
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
function updateStatus(city){
 const count=treePoints.size,woods=woodAreas.size;
 const el=document.getElementById('treeLiveStatus');
 if(el)el.textContent='DARAXTLAR: '+count+' aniq belgi • '+woods+' o‘rmon hududi'+(busy?' • yuklanmoqda':'');
}
function applyTile(data,city,c,tx,ty){
 for(let i=0;i<data.trees.length;i++){
  const [lon,lat]=data.trees[i],p=toLocal(lon,lat,c),key='p'+Math.round(p[0])+'/'+Math.round(p[1]);
  if(window.CYH_TERRAIN&&!CYH_TERRAIN.inside(p[0],p[1]))continue;
  treePoints.set(key,{x:p[0],z:p[1],exact:true});
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
 return trees.slice(0,90);
}
async function sync(force=false){
 if(busy)return;
 const c=ctx();if(!c)return;
 const {city,lon,lat,x,z}=c;
 if(city!==lastCity){treePoints.clear();woodAreas.clear();lastCity=city;lastTile=''}
 const ll=coords(lon+x/(111320*Math.cos(lat*Math.PI/180)),lat+z/111320);
 const tx=Math.floor(ll.x),ty=Math.floor(ll.y),id=city+'/'+tx+'/'+ty;
 if(!force&&id===lastTile)return;
 busy=true;pendingCity=city;updateStatus(city);
 try{
  const locations=[];for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)locations.push([tx+dx,ty+dy]);
  const vals=await Promise.allSettled(locations.map(([a,b])=>getTile(a,b)));
  if(ctx()?.city!==city)return;
  let received=0;for(let i=0;i<vals.length;i++)if(vals[i].status==='fulfilled'){
   applyTile(vals[i].value,city,c,...locations[i]);received++;
  }else failures++;
  if(received){lastTile=id;window.CYH_TREE_REBUILD?.()}
  else console.warn('Daraxt qatlamlari yuklanmadi');
 }finally{busy=false;updateStatus(city)}
}
window.CYH_TREE_DATA={getChunkTrees,sync,status:()=>({points:treePoints.size,woods:woodAreas.size,failures})};
