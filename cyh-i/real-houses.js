/* CYH I - visible OSM building footprints, streamed around the player.
   Real coordinates and outlines; house heights, walls and roofs are approximate when untagged. */
import { VectorTile } from 'https://esm.sh/@mapbox/vector-tile@2.0.4';
import Pbf from 'https://esm.sh/pbf@4.0.1';
const Z=14,N=2**Z,tileCache=new Map();let busy=false,lastCell='',lastCity='',failures=0;
const xy=(lon,lat)=>({x:(lon+180)/360*N,y:(1-Math.log(Math.tan(lat*Math.PI/180)+1/Math.cos(lat*Math.PI/180))/Math.PI)/2*N});
const context=()=>window.CYH_REAL_ROAD_CONTEXT?.();
function progress(msg,error=false){const el=document.getElementById('houseLiveStatus');if(el){el.textContent=msg;el.style.borderColor=error?'#f4a5a5':'#a4d0ad'}}
async function tile(x,y){
 const id=Z+'/'+x+'/'+y;
 if(tileCache.has(id))return tileCache.get(id);
 const request=(async()=>{
  const res=await fetch('https://tiles.openfreemap.org/planet/latest/'+id+'.pbf');
  if(!res.ok)throw Error('HTTP '+res.status);
  const t=new VectorTile(new Pbf(new Uint8Array(await res.arrayBuffer())));
  const layer=t.layers.building;if(!layer)return [];
  const features=[];
  for(let i=0;i<layer.length&&features.length<2200;i++){
   const f=layer.feature(i);if(f.type!==3)continue;
   const g=f.toGeoJSON(x,y,Z).geometry;
   if(!g||!['Polygon','MultiPolygon'].includes(g.type))continue;
   const p=f.properties||{},height=Number(p.render_height||p.height||0);
   const levels=Number(p['building:levels']||p.levels||0);
   const category=p.class||p.subclass||p.type||'yes';
   const props={
    id:f.id||id+'-'+i,building:category,height:height>1&&height<180?height:undefined,
    'building:levels':levels>0&&levels<50?levels:undefined,
    'building:colour':p['building:colour']||p.color||undefined,
    'roof:colour':p['roof:colour']||undefined
   };
   features.push({type:'Feature',id:props.id,properties:props,geometry:g});
  }
  return features;
 })();
 tileCache.set(id,request);try{return await request}catch(e){tileCache.delete(id);throw e}
}
async function sync(force=false){
 if(busy)return;
 const c=context();if(!c)return;
 const {city,lon,lat,x,z}=c;
 const p=xy(lon+x/(111320*Math.cos(lat*Math.PI/180)),lat+z/111320);
 const tx=Math.floor(p.x),ty=Math.floor(p.y),key=city+'/'+tx+'/'+ty;
 if(!force&&key===lastCell)return;
 busy=true;progress('HOVLI UYLAR: haqiqiy konturlar yuklanmoqda');
 try{
  const requested=[];for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)requested.push([tx+dx,ty+dy]);
  const results=await Promise.allSettled(requested.map(([a,b])=>tile(a,b)));
  if(context()?.city!==city)return;
  let features=[],ok=0;for(const result of results){
   if(result.status==='fulfilled'){features.push(...result.value);ok++}else failures++;
  }
  if(!ok)throw Error('Bino qatlamini olish imkonsiz');
  lastCell=key;lastCity=city;
  if(features.length){const byId=new Map();
   for(const f of features)byId.set(String(f.id),f);
   features=[...byId.values()];
   window.CYH_HOUSE_APPLY?.({type:'FeatureCollection',features},'© OpenStreetMap contributors • OpenFreeMap');
  }
  progress('HOVLI UYLAR: '+features.length+' ta xaritadagi bino');
 }catch(e){progress('HOVLI UYLAR: yuklashda xato • qayta urin',true);console.warn('CYH houses:',e)}
 finally{busy=false}
}
window.CYH_HOUSES={sync,refresh:()=>sync(true),status:()=>({city:lastCity,failures})};
