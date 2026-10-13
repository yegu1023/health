'use strict';
let loading,rows=[];
const norm=s=>s.toLowerCase().replace(/[\s_\-·]/g,'');
async function load(){
 const response=await fetch('data/manifest.json');if(!response.ok)throw Error('식품 데이터 목록을 불러오지 못했습니다.');
 const manifest=await response.json();
 for(let i=0;i<manifest.parts.length;i++){
  const r=await fetch('data/'+manifest.parts[i]);if(!r.ok)throw Error('식품 데이터를 불러오지 못했습니다.');
  const bytes=r.body.pipeThrough(new DecompressionStream('gzip'));
  const part=JSON.parse(await new Response(bytes).text());
  rows.push(...part.map(a=>({a,key:norm(a[1]+' '+a[2])})));
  postMessage({type:'progress',value:Math.round((i+1)/manifest.parts.length*100)});
 }
}
onmessage=async({data})=>{try{
 if(!loading)loading=load().catch(e=>{loading=null;rows=[];throw e});await loading;
 const terms=norm(data.q).split(/[,，]/).filter(Boolean);const words=data.q.toLowerCase().trim().split(/\s+/).map(norm).filter(Boolean);
 let count=0,matches=[];
 for(const row of rows)if(words.every(w=>row.key.includes(w))){count++;if(matches.length<80)matches.push(row.a)}
 matches.sort((a,b)=>(a.slice(4,8).includes(null)?1:0)-(b.slice(4,8).includes(null)?1:0));
 postMessage({type:'result',id:data.id,count,rows:matches});
 }catch(e){postMessage({type:'error',id:data.id,message:e.message})}};
