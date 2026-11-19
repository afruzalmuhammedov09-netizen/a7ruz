/* CYH I geo-referenced terrain; Mapzen Terrarium elevation tiles (metres). */
(function(){
'use strict';
const Z=12,N=2**Z,T=256,cache=new Map();
let city='',lat0=40.115,lon0=67.842,base=0,baseReady=false,pending=0,failed=0;
const api={onChange:null,city:'',ready:false,source:'Mapzen/AWS Terrarium DEM'};
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function tileXY(lon,lat){lat=clamp(lat,-85,85);const sin=Math.sin(lat*Math.PI/180);return {x:(lon+180)/360*N,y:(1-Math.log((1+sin)/(1-sin))/(2*Math.PI))/2*N}}
function position(x,z){return {lon:lon0+x/(111320*Math.cos(lat0*Math.PI/180)),lat:lat0+z/111320}}
function sampleTile(t,px,py){
 const x=clamp(Math.floor(px),0,255),y=clamp(Math.floor(py),0,255),k=(y*256+x)*4;
 return t[k]*256+t[k+1]+t[k+2]/256-32768;
}
function tileKey(x,y){return Z+'/'+x+'/'+y}
function fetchTile(x,y){
 if(x<0||x>=N||y<0||y>=N)return;
 const key=tileKey(x,y);if(cache.has(key))return;
 const record={status:'loading',data:null};cache.set(key,record);pending++;
 const img=new Image();img.crossOrigin='anonymous';
 img.onload=()=>{
  try{
   const c=document.createElement('canvas');c.width=c.height=256;
   const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,256,256);
   record.data=ctx.getImageData(0,0,256,256).data;record.status='ready';
  }catch(e){record.status='error';failed++}
  pending--;update();
 };
 img.onerror=()=>{record.status='error';failed++;pending--;update()};
 img.src='https://s3.amazonaws.com/elevation-tiles-prod/terrarium/'+key+'.png';
}
function rawElevation(x,z,load=true){
 const {lon,lat}=position(x,z),xy=tileXY(lon,lat);
 const tx=Math.floor(xy.x),ty=Math.floor(xy.y),key=tileKey(tx,ty);
 if(load)fetchTile(tx,ty);
 const rec=cache.get(key);if(!rec||rec.status!=='ready')return null;
 const px=(xy.x-tx)*T,py=(xy.y-ty)*T;
 const x0=Math.floor(px),y0=Math.floor(py),a=px-x0,b=py-y0;
 const h00=sampleTile(rec.data,x0,y0),h10=sampleTile(rec.data,x0+1,y0),
       h01=sampleTile(rec.data,x0,y0+1),h11=sampleTile(rec.data,x0+1,y0+1);
 return (h00*(1-a)+h10*a)*(1-b)+(h01*(1-a)+h11*a)*b;
}
function update(){
 const el=document.getElementById('demTerrainStatus');
 if(el)el.textContent=baseReady?('REAL DEM • '+city+' • '+Math.round(base)+' m (markaz)'):
   failed&&!pending?'DEM yuklanmadi — tekis zaxira':('DEM yuklanmoqda • '+city);
 const origin=rawElevation(0,0,false);
 if(origin!==null){base=origin;baseReady=true;api.ready=true}
 if(api.onChange)api.onChange();
}
api.setCity=function(name,cities){
 const c=(cities||[]).find(v=>v[0]===name);
 if(!c||!Number.isFinite(c[1])||!Number.isFinite(c[2]))return;
 city=name;api.city=city;lon0=c[1];lat0=c[2];baseReady=false;base=0;
 rawElevation(0,0,true);update();
};
api.elevation=function(x,z){return rawElevation(x,z,true)};
api.height=function(x,z){
 const h=rawElevation(x,z,true);
 return h===null||!baseReady?0:h-base;
};
api.toCoordinates=position;
api.drawChunk=function(m,cx,cz){
 const step=10,side=160,ox=cx*side,oz=cz*side;
 // Terrain triangles preserve DEM ridge shapes and actual geographic positions.
 const cells=side/step;
 for(let i=0;i<cells;i++)for(let j=0;j<cells;j++){
  const x=ox+i*step,z=oz+j*step,vertices=[
   [x,api.height(x,z),z],[x+step,api.height(x+step,z),z],
   [x+step,api.height(x+step,z+step),z+step],[x,api.height(x,z+step),z+step]
  ];
  const elev=base+(vertices[0][1]+vertices[1][1]+vertices[2][1]+vertices[3][1])/4;
  const col=elev>3500?'#e4e8e3':elev>2700?'#95988a':elev>1900?'#97887a':elev>1100?'#847e67':elev>600?'#73946e':'#789b76';
  m.quad(vertices[0],vertices[3],vertices[2],vertices[1],col);
 }
};
api.status=function(){return {city,ready:baseReady,pending,failed,base}};
window.CYH_TERRAIN=api;
})();