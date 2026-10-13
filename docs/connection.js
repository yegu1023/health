(() => {
const nativeFetch=window.fetch.bind(window), cfg=window.ENERGY_CONNECTION||{};
let session=null;
const reply=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
const configured=()=>/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(cfg.url)&&/^sb_publishable_/.test(cfg.publishableKey);
async function request(path,body,token,signal){
 if(!configured())throw Error('연결 설정이 필요합니다. setup.html에서 설정 파일을 만들어 주세요.');
 const r=await nativeFetch(cfg.url+path,{method:'POST',signal,headers:{apikey:cfg.publishableKey,'content-type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});
 const data=await r.json();if(!r.ok)throw Error(data.message||data.msg||data.error_description||'서버 연결을 확인해 주세요.');return data;
}
async function token(){
 if(!session)return null;
 if(Date.now()>session.expiresAt-60000){const data=await request('/auth/v1/token?grant_type=refresh_token',{refresh_token:session.refresh_token});session={...data,expiresAt:Date.now()+data.expires_in*1000};}
 return session.access_token;
}
window.energyLogout=()=>{session=null;location.reload()};
window.fetch=async(input,options={})=>{
 const path=typeof input==='string'?input:'';if(!path.startsWith('/api/'))return nativeFetch(input,options);
 try{
 const parsed=new URL(path,location.origin), action=parsed.pathname.slice(5), payload=options.body?JSON.parse(options.body):{};
 if(action==='login'){
  const data=await request('/auth/v1/token?grant_type=password',{email:document.querySelector('#email').value.trim(),password:payload.password},null,options.signal);
  session={...data,expiresAt:Date.now()+data.expires_in*1000};
  try{await request('/rest/v1/rpc/energy_api',{action:'admin-check',payload:{}},await token(),options.signal)}catch(e){session=null;throw e}
  return reply({ok:true});
 }
 if(action==='reset'){return reply(await request('/rest/v1/rpc/energy_reset_stats',{confirmation:payload.confirmation},await token(),options.signal))}
 const rpcAction=action==='questions'&&options.method==='POST'?'save-questions':action;
 if(action==='stats')payload.version=parsed.searchParams.get('version')||'';
 const value=await request('/rest/v1/rpc/energy_api',{action:rpcAction,payload},await token(),options.signal);
 return reply(value);
 }catch(e){return reply({error:e.message},400)}
};
window.energyDownload=async()=>{
 const r=await fetch('/api/export');const rows=await r.json();if(!r.ok){document.querySelector('#admin-status').textContent=rows.error;return}
 const csv='\ufeff'+['participation_id,D,I,S,C,desired_energy,question_version,quiz_count,consent_version,consented_at_utc,completed_at_utc',...rows.map(r=>[r.id,...['D','I','S','C'].map(k=>r.scores[k]),r.need,r.version,r.quiz_count,r.consent_version||'',r.consented_at||'',r.created_at].join(','))].join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='TEAM_ENERGY_응답.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
})();
