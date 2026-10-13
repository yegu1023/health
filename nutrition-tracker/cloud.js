'use strict';
const CLOUD_URL='https://bqinkrveniupnwvdylko.supabase.co';
const CLOUD_KEY='sb_publishable_ZP7QTLmRW4XUePq9n3QeMw_SvXLFuIU';
const AUTH_KEY='nutrition-auth-v1';
let session=null,cloudInitializing=false,cloudReady=false,cloudBusy=false,cloudDirty=false,cloudConflict=false,cloudRevision=0,cloudMessage='브라우저에 저장 중',cloudTimer,refreshPromise;
try{session=JSON.parse(localStorage.getItem(AUTH_KEY))}catch{}
const accountKey=()=>session?'nutrition-cloud-'+session.user.id:KEY;
function cloudStatus(){return `<div class="card"><div class="row"><div><b>${session?esc(session.user.email):'기록 동기화'}</b><div class="muted" id="cloudStatus">${esc(cloudMessage)}</div></div><button data-cloud="${session?'sync':'login'}">${session?'동기화':'로그인'}</button></div>${cloudConflict?'<p class="note">다른 기기의 기록이 변경됐습니다. 자동 덮어쓰기를 중단했습니다. 이 기기 기록을 백업하고 서버 기록을 확인하세요.</p><button data-cloud="server">서버 기록으로 전환</button>':''}${session?'<div class="actions"><button data-cloud="migrate">이전 브라우저 기록 가져오기</button><button data-cloud="logout">로그아웃</button></div>':''}</div>`}
function cloudPaint(){const el=document.querySelector('#cloudPanel');if(el)el.innerHTML=cloudStatus()}
function cloudSet(s){cloudMessage=s;cloudPaint()}
function keepSession(s){session={...s,expires_at:s.expires_at||Math.floor(Date.now()/1000)+(s.expires_in||3600)};localStorage.setItem(AUTH_KEY,JSON.stringify(session))}
async function api(path,body,token){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
 try{const res=await fetch(CLOUD_URL+path,{method:body===undefined?'GET':'POST',headers:{apikey:CLOUD_KEY,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:controller.signal});
 const raw=await res.text();let value;try{value=raw?JSON.parse(raw):null}catch{throw Error('서버 응답을 읽지 못했습니다.')}
 if(!res.ok){const err=Error(value?.msg||value?.message||value?.error_description||'서버 연결 실패');err.status=res.status;throw err}return value;
 }finally{clearTimeout(timer)}
}
async function token(){
 if(!session)throw Error('로그인이 필요합니다.');
 if(session.expires_at>Math.floor(Date.now()/1000)+60)return session.access_token;
 if(!refreshPromise)refreshPromise=api('/auth/v1/token?grant_type=refresh_token',{refresh_token:session.refresh_token}).then(s=>{keepSession(s);return s.access_token}).finally(()=>refreshPromise=null);
 return refreshPromise;
}
async function cloudApi(path,body){return api(path,body,await token())}
function persistAccount(){localStorage.setItem(accountKey(),JSON.stringify({data:db,revision:cloudRevision,dirty:cloudDirty,conflict:cloudConflict}))}
function cloudChanged(){
 if(!session)return;
 cloudDirty=true;try{persistAccount()}catch{toast('기기 저장 공간이 부족합니다. 백업해주세요.')}
 cloudSet(cloudConflict?'기록 충돌 · 자동 저장 중단':'기기에 저장됨 · 서버 저장 대기');
 clearTimeout(cloudTimer);if(cloudReady&&!cloudConflict)cloudTimer=setTimeout(()=>cloudSync(),700);
}
async function cloudSync(){
 if(!session||!cloudReady||cloudBusy||cloudConflict)return;
 cloudBusy=true;cloudSet('동기화 중…');
 try{
 if(cloudDirty){
  const payload=JSON.stringify(db),rev=await cloudApi('/rest/v1/rpc/save_nutrition',{p_data:JSON.parse(payload),p_revision:cloudRevision});
  cloudRevision=Number(rev);cloudDirty=JSON.stringify(db)!==payload;persistAccount();cloudSet(cloudDirty?'추가 변경 저장 대기':'서버 저장 완료');
 }else{
  const records=await cloudApi('/rest/v1/nutrition_accounts?select=data,revision&user_id=eq.'+encodeURIComponent(session.user.id));
  if(records.length){if(cloudDirty){cloudSet('추가 변경 저장 대기');return}if(!validBackup(records[0].data))throw Error('서버 기록 형식 확인이 필요합니다.');db=records[0].data;cloudRevision=Number(records[0].revision);persistAccount();render()}
  cloudSet('서버 기록 확인 완료');
 }
 }catch(e){
 if(e.message.includes('SYNC_CONFLICT')){cloudConflict=true;persistAccount();cloudSet('다른 기기와 기록 충돌 · 백업 후 확인 필요')}
 else cloudSet(e.status===401?'로그인이 만료됐습니다. 로그아웃 후 다시 로그인해주세요.':e.message.includes('nutrition_accounts')||e.message.includes('save_nutrition')?'DB 설정이 필요합니다. SQL 파일을 먼저 실행해주세요.':'서버 저장 실패 · 기기 기록 유지 · 동기화 버튼으로 재시도');
 }finally{cloudBusy=false;if(cloudDirty&&!cloudConflict&&cloudMessage==='추가 변경 저장 대기')cloudTimer=setTimeout(()=>cloudSync(),200)}
}
async function cloudStart(){
 cloudInitializing=true;cloudReady=false;cloudConflict=false;cloudRevision=0;cloudDirty=false;
 try{
 const cached=JSON.parse(localStorage.getItem(accountKey())||'null');
 if(cached&&validBackup(cached.data)){db=cached.data;cloudRevision=cached.revision;cloudDirty=!!cached.dirty;cloudConflict=!!cached.conflict}
 else db=initial();
 render();
 if(cloudConflict){cloudReady=true;cloudSet('다른 기기와 기록 충돌 · 백업 후 확인 필요');return}
 cloudReady=true;await cloudSync();
 }catch{cloudReady=true;cloudSet('서버 연결 실패 · 로그인 또는 동기화 재시도 필요')}finally{cloudInitializing=false}
}
function authDialog(){
 const m=document.querySelector('#modal');m.innerHTML=`<form id="authForm"><div class="row"><h2>기록 동기화 로그인</h2><button type="button" id="authClose">✕</button></div><label>이메일</label><input name="email" type="email" autocomplete="email" required><label>비밀번호</label><input name="password" type="password" minlength="8" autocomplete="current-password" required><p class="note">처음이라면 회원가입 후 이메일 인증을 진행하세요. 기존 브라우저 기록은 로그인 후 별도로 가져올 수 있습니다.</p><div class="actions"><button class="primary" type="submit" value="login">로그인</button><button type="submit" value="signup">회원가입</button></div><p id="authMessage" class="note"></p></form>`;m.showModal();
 m.querySelector('#authClose').onclick=()=>m.close();
 m.querySelector('#authForm').onsubmit=async e=>{
 e.preventDefault();const form=e.target,fd=new FormData(form),signup=e.submitter?.value==='signup';form.querySelectorAll('button[type=submit]').forEach(b=>b.disabled=true);
 try{
 const result=await api(signup?'/auth/v1/signup':'/auth/v1/token?grant_type=password',{email:fd.get('email'),password:fd.get('password'),...(signup?{data:{app:'nutrition-tracker'}}:{})});
 if(!result.access_token){form.querySelector('#authMessage').textContent='인증 이메일을 확인한 뒤 이 화면에서 로그인해주세요.';return}
 keepSession(result);m.close();await cloudStart();
 }catch(err){form.querySelector('#authMessage').textContent=err.status===400?'이메일·비밀번호 또는 이메일 인증 여부를 확인해주세요.':err.message}
 finally{form.querySelectorAll('button[type=submit]').forEach(b=>b.disabled=false)}
 };
}
async function useServer(){
 if(!confirm('이 기기 기록을 먼저 백업했나요? 서버 기록으로 전환하면 이 기기의 미동기화 변경은 별도 보관됩니다.'))return;
 cloudBusy=true;
 try{
 const rows=await cloudApi('/rest/v1/nutrition_accounts?select=data,revision&user_id=eq.'+encodeURIComponent(session.user.id));
 if(!rows.length||!validBackup(rows[0].data))throw Error('서버 기록을 확인할 수 없습니다.');
 localStorage.setItem(accountKey()+'-conflict-'+Date.now(),JSON.stringify(db));db=rows[0].data;cloudRevision=Number(rows[0].revision);cloudDirty=false;cloudConflict=false;persistAccount();render();cloudSet('서버 기록으로 전환 완료');
 }catch(e){cloudSet(e.message)}finally{cloudBusy=false}
}
function migrateLocal(){
 try{
 const legacy=JSON.parse(localStorage.getItem(KEY)||'null');if(!validBackup(legacy))return toast('이전 브라우저 기록이 없습니다.');
 if(!confirm('이전 브라우저의 날짜별 기록을 가져올까요? 같은 날짜는 서버 기록을 유지하고 없는 날짜만 추가합니다. 내 식품과 고정 식단도 없는 항목만 추가합니다.'))return;
 for(const [d,x] of Object.entries(legacy.days))if(!db.days[d])db.days[d]=x;
 for(const k of ['foods','templates'])for(const x of legacy[k])if(!db[k].some(v=>v.id===x.id))db[k].push(x);
 for(const g of legacy.goals)if(!db.goals.some(x=>x.from===g.from))db.goals.push(g);
 save();render();toast('이전 기록을 가져왔습니다. 서버 저장 상태를 확인해주세요.');
 }catch(e){toast(e.message)}
}
document.addEventListener('click',e=>{if(cloudInitializing&&e.target.closest('[data-action]')){e.stopImmediatePropagation();toast('서버 기록을 불러오는 중입니다. 잠시 기다려주세요.')}},true);
document.addEventListener('change',e=>{if(cloudInitializing){e.stopImmediatePropagation();toast('서버 기록을 불러오는 중입니다. 잠시 기다려주세요.')}},true);
document.addEventListener('click',async e=>{
 const b=e.target.closest('[data-cloud]');if(!b)return;const action=b.dataset.cloud;
 if(action==='login')authDialog();
 else if(cloudInitializing)return toast('서버 기록을 불러오는 중입니다.');
 else if(action==='sync')await cloudSync();
 else if(action==='server'&&!cloudBusy)await useServer();
 else if(action==='migrate'&&cloudReady&&!cloudBusy&&!cloudConflict)migrateLocal();
 else if(action==='logout'){
 if(cloudBusy)return toast('동기화가 끝난 후 로그아웃해주세요.');
 if(cloudDirty&&!confirm('서버에 저장되지 않은 기록이 있습니다. 이 기기에 보관하고 로그아웃할까요?'))return;
 clearTimeout(cloudTimer);try{await api('/auth/v1/logout',{},session.access_token)}catch{}
 session=null;localStorage.removeItem(AUTH_KEY);cloudReady=false;cloudDirty=false;cloudConflict=false;
 try{db=JSON.parse(localStorage.getItem(KEY))||initial()}catch{db=initial()}
 cloudSet('브라우저에 저장 중');render();
 }
});
window.addEventListener('online',()=>cloudSync());
window.addEventListener('focus',()=>cloudSync());
window.addEventListener('beforeunload',e=>{if(session&&cloudDirty){e.preventDefault();e.returnValue=''}});
setInterval(()=>cloudSync(),60000);
if(session)cloudStart();else render();
