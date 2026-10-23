'use strict';
let loading,rows=[];
const norm=s=>s.toLowerCase().replace(/[\s_\-·]/g,'');
let assetToken=0;const pendingAssets=new Map();
function readAsset(path){return new Promise((resolve,reject)=>{const token=++assetToken;pendingAssets.set(token,{resolve,reject});postMessage({type:'asset-request',path,token})})}
async function load(){
 const manifest=JSON.parse(new TextDecoder().decode(await readAsset('data/manifest.json')));
 const parts=new Array(manifest.parts.length);let cursor=0,done=0;
 async function next(){while(cursor<manifest.parts.length){const i=cursor++,buffer=await readAsset('data/'+manifest.parts[i]),bytes=new Uint8Array(buffer);let text;
 if(bytes[0]===31&&bytes[1]===139){if(typeof DecompressionStream==='undefined')throw Error('Android System WebView 업데이트 후 다시 검색해주세요.');text=await new Response(new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))).text()}else text=new TextDecoder().decode(bytes);
 const part=JSON.parse(text);if(!Array.isArray(part))throw Error('식품 데이터 형식이 올바르지 않습니다.');parts[i]=part.map(a=>({a,key:norm(a[1]+' '+a[2])}));postMessage({type:'progress',value:Math.round(++done/manifest.parts.length*100)});
 }}
 const results=await Promise.allSettled(Array.from({length:3},next));const failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;
 rows=parts.flat();
}
onmessage=async({data})=>{if(data.type==='asset-response'){const request=pendingAssets.get(data.token);if(request){pendingAssets.delete(data.token);data.error?request.reject(Error(data.error)):request.resolve(data.bytes)}return}try{
 if(!loading)loading=load().catch(e=>{loading=null;rows=[];throw e});await loading;
 const words=data.q.toLowerCase().trim().split(/\s+/).map(norm).filter(Boolean),query=norm(data.q);
 let count=0,matches=[];
 const score=a=>{const name=norm(a[1]),general=a[8]!=='가공식품';return (name===query?0:name.startsWith(query)?10:30)+(general?0:20)+(a.slice(4,8).includes(null)?100:0)+Math.min(20,name.length/10)};
 for(const row of rows){const general=row.a[8]!=='가공식품';if(data.category==='general'&&!general||data.category==='product'&&general)continue;if(words.every(w=>row.key.includes(w))){count++;matches.push({a:row.a,score:score(row.a)});if(matches.length>160){matches.sort((a,b)=>a.score-b.score);matches.length=80}}}
 matches.sort((a,b)=>a.score-b.score);matches=matches.slice(0,80).map(r=>r.a);
 postMessage({type:'result',id:data.id,count,rows:matches});
 }catch(e){postMessage({type:'error',id:data.id,message:e.message})}};
