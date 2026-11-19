/* CYH I actual OpenStreetMap transportation geometry, streamed by vector tiles. */
import { VectorTile } from 'https://esm.sh/@mapbox/vector-tile@2.0.4';
import Pbf from 'https://esm.sh/pbf@4.0.1';
const Z=14, N=2**Z, cache=new Map(), MAX_TILES=80;
let busy=false, loadedCity='',lastX=Infinity,lastZ=Infinity,activeCenter='';
const okTypes=new Set(['motorway','trunk','primary','secondary','tertiary','minor','service','track','path','busway']);
const tileCoordinates=(lon,lat)=>({
 x:(lon+180)/360*N,
 y:(1-Math.log(Math.tan(lat*Math.PI/180)+1/Math.cos(lat*Math.PI/180))/Math.PI)/2*N
});
function getCity(){
 return window.CYH_REAL_ROAD_CONTEXT?.();
}
function status(t,failed=false){window.CYH_REAL_ROAD_STATUS?.(t,failed)}
async function fetchTile(x,y){
 const k=Z+'/'+x+'/'+y;
 if(cache.has(k))return cache.get(k);
 const promise=(async()=>{
  const res=await fetch('https://tiles.openfreemap.org/planet/latest/'+k+'.pbf');
  if(!res.ok)throw Error('OpenFreeMap '+res.status);
  const bytes=new Uint8Array(await res.arrayBuffer());
  const tile=new VectorTile(new Pbf(bytes)),layer=tile.layers.transportation;
  if(!layer)return [];
  const features=[];
  for(let i=0;i<layer.length&&features.length<3200;i++){
   const f=layer.feature(i),cls=f.properties.class;
   if(f.type!==2||!okTypes.has(cls)||f.properties.brunnel==='tunnel')continue;
   const geo=f.toGeoJSON(x,y,Z);
   const props={highway:cls,name:f.properties.name||''};
   if(geo.geometry?.type==='LineString')features.push({type:'Feature',geometry:geo.geometry,properties:props});
   if(geo.geometry?.type==='MultiLineString')features.push({type:'Feature',geometry:geo.geometry,properties:props});
  }
  return features;
 })();
 cache.set(k,promise);
 try{return await promise}catch(e){cache.delete(k);throw e}
}
async function sync(force=false){
 if(busy)return;
 const c=getCity();if(!c)return;
 const {city,lon,lat,x,z}=c;
 const center=tileCoordinates(lon+x/(111320*Math.cos(lat*Math.PI/180)),lat+z/111320);
 const tx=Math.floor(center.x),ty=Math.floor(center.y),id=city+':'+tx+':'+ty;
 if(!force&&id===activeCenter&&Math.hypot(x-lastX,z-lastZ)<260)return;
 busy=true;loadedCity=city;lastX=x;lastZ=z;
 status('Haqiqiy O‘zbekiston yo‘llari yuklanmoqda: '+city);
 try{
  const coords=[];
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)coords.push([tx+dx,ty+dy]);
  const collected=[];let failures=0;
  for(let k=0;k<coords.length;k+=3){
   const group=coords.slice(k,k+3);
   const results=await Promise.allSettled(group.map(([a,b])=>fetchTile(a,b)));
   for(const r of results){if(r.status==='fulfilled')collected.push(...r.value);else failures++}
  }
  const fresh=getCity();
  if(!fresh||fresh.city!==city)return;
  if(!collected.length)throw Error('Yo‘l qatlami kelmadi ('+failures+' ta tile xato)');
  window.CYH_REAL_ROAD_APPLY?.({type:'FeatureCollection',features:collected},'© OpenStreetMap contributors • OpenFreeMap');
  activeCenter=id;status('HAQIQIY YO‘LLAR: '+collected.length+' ta bo‘lak • '+city);
  if(cache.size>MAX_TILES)cache.clear();
 }catch(e){
  status('Haqiqiy yo‘llar yuklanmadi. Qayta urinish',true);
  console.warn('CYH vector roads:',e);
 }finally{busy=false}
}
window.CYH_VECTOR_ROADS={sync,refresh:()=>sync(true),ready:true};
status('Haqiqiy OSM yo‘llari • tayyor');
