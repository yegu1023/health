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
 const words=data.q.toLowerCase().trim().split(/\s+/).map(norm).filter(Boolean),query=norm(data.q);
 let count=0,matches=[];
 const score=a=>{const name=norm(a[1]),general=a[8]!=='가공식품';return (name===query?0:name.startsWith(query)?10:30)+(general?0:20)+(a.slice(4,8).includes(null)?100:0)+Math.min(20,name.length/10)};
 for(const row of rows){const general=row.a[8]!=='가공식품';if(data.category==='general'&&!general||data.category==='product'&&general)continue;if(words.every(w=>row.key.includes(w))){count++;matches.push({a:row.a,score:score(row.a)});if(matches.length>160){matches.sort((a,b)=>a.score-b.score);matches.length=80}}}
 matches.sort((a,b)=>a.score-b.score);matches=matches.slice(0,80).map(r=>r.a);
 postMessage({type:'result',id:data.id,count,rows:matches});
 }catch(e){postMessage({type:'error',id:data.id,message:e.message})}};
