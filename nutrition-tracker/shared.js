'use strict';
const SHARED_URL='https://bqinkrveniupnwvdylko.supabase.co';
const SHARED_KEY='sb_publishable_ZP7QTLmRW4XUePq9n3QeMw_SvXLFuIU';
const BOARD='health-shared-v5',SHARED_CACHE='nutrition-shared-v5',SELECTED='nutrition-selected-profile';
let activeProfile=localStorage.getItem(SELECTED)||'seunggu',sharedBoard,sharedRevision=0,sharedDirty=false,sharedBusy=false,sharedConflict=false,sharedTimer,sharedMessage='기기에 저장 중 · 서버 확인 대기',sharedGeneration=0;
function legacyRecord(){
 try{const auth=JSON.parse(localStorage.getItem('nutrition-auth-v1')||'null'),cached=auth?.user?.id&&JSON.parse(localStorage.getItem('nutrition-cloud-'+auth.user.id)||'null');if(cached&&validBackup(cached.data))return cached.data}catch{}
 try{const legacy=JSON.parse(localStorage.getItem(KEY)||'null');if(validBackup(legacy))return legacy}catch{}
 return initial();
}
function validBoard(b){return b?.version===5&&Array.isArray(b.profiles)&&b.profiles.length>0&&new Set(b.profiles.map(p=>p.id)).size===b.profiles.length&&b.profiles.every(p=>typeof p.id==='string'&&typeof p.name==='string'&&p.name.trim()&&validBackup(p.data))}
try{const cache=JSON.parse(localStorage.getItem(SHARED_CACHE)||'null');if(cache&&validBoard(cache.board)){sharedBoard=cache.board;sharedRevision=cache.revision;sharedDirty=!!cache.dirty;sharedConflict=!!cache.conflict}}catch{}
if(!sharedBoard)sharedBoard={version:5,profiles:[{id:'seunggu',name:'조승구',data:legacyRecord()}]};
function activeData(){if(!sharedBoard.profiles.some(p=>p.id===activeProfile))activeProfile=sharedBoard.profiles[0].id;return sharedBoard.profiles.find(p=>p.id===activeProfile).data}
db=activeData();
function storeShared(){localStorage.setItem(SHARED_CACHE,JSON.stringify({board:sharedBoard,revision:sharedRevision,dirty:sharedDirty,conflict:sharedConflict}));localStorage.setItem(SELECTED,activeProfile)}
function sharedSave(){try{sharedBoard.profiles.find(p=>p.id===activeProfile).data=db;sharedDirty=true;sharedGeneration++;storeShared();sharedMessage=sharedConflict?'기록 충돌 · 전체 백업 후 서버 기록 확인 필요':'기기 저장 완료 · 서버 저장 대기';sharedPaint();clearTimeout(sharedTimer);sharedTimer=setTimeout(()=>syncShared(),800);return true}catch{toast('기기 저장 실패 · 전체 백업을 받아주세요.');return false}}
function cloudStatus(){return `<div class="profile-strip" role="tablist" aria-label="사람 선택">${sharedBoard.profiles.map(p=>`<button role="tab" aria-selected="${p.id===activeProfile}" class="sheet-tab ${p.id===activeProfile?'selected':''}" data-profile="${esc(p.id)}">${esc(p.name)}</button>`).join('')}<button class="sheet-tab add-profile" data-shared="add" aria-label="사람 추가">＋</button></div>`}
function sharedSettingsHTML(){return `<div class="card" id="sharedSettings"><h2>공동 관리 · 동기화</h2><p class="muted" id="sharedMessage">${esc(sharedMessage)}</p><div class="actions"><button data-shared="sync">동기화</button><button data-shared="rename">이름 변경</button><button data-shared="backup">전체 백업</button><button data-shared="restore">전체 백업 가져오기</button><button data-shared="legacy">이전 기록 가져오기</button>${sharedConflict?'<button data-shared="server">서버 기록으로 전환</button>':''}</div><input id="sharedImport" type="file" accept="application/json" hidden><p class="note">공동 관리 모드 · 접속자는 모든 사람의 식단을 조회·수정할 수 있습니다. 총 수분은 물·커피·차 등을 마신 양의 합계이며 실제 흡수량을 뜻하지 않습니다.</p></div>`}
function sharedPaint(){const panel=document.querySelector('#cloudPanel');if(panel)panel.innerHTML=cloudStatus();const settings=document.querySelector('#sharedSettings');if(settings)settings.outerHTML=sharedSettingsHTML()}

async function sharedApi(path,body){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);try{
 const response=await fetch(SHARED_URL+'/rest/v1/'+path,{method:body===undefined?'GET':'POST',headers:{apikey:SHARED_KEY,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:controller.signal});const value=await response.json();if(!response.ok)throw Error(value.message||'서버 연결 실패');return value;
}finally{clearTimeout(timer)}}
async function syncShared(){
 if(sharedBusy||sharedConflict)return;sharedBusy=true;sharedMessage='동기화 중…';sharedPaint();let again=false;
 try{
 if(sharedDirty){const generation=sharedGeneration,payload=structuredClone(sharedBoard);const rev=await sharedApi('rpc/save_nutrition_shared',{p_board:BOARD,p_data:payload,p_revision:sharedRevision});sharedRevision=Number(rev);sharedDirty=sharedGeneration!==generation;again=sharedDirty;storeShared();sharedMessage=sharedDirty?'추가 변경 저장 대기':'서버 저장 완료'}
 else{
 const generation=sharedGeneration,records=await sharedApi('nutrition_shared?select=data,revision&board_id=eq.'+BOARD);
 if(sharedGeneration!==generation||document.querySelector('#modal')?.open){sharedMessage='기기 기록 유지 · 다음 동기화에서 확인';return}
 if(records.length){if(!validBoard(records[0].data))throw Error('서버 기록 형식 확인이 필요합니다.');sharedBoard=records[0].data;sharedRevision=Number(records[0].revision);db=activeData();storeShared();render();sharedMessage='서버 기록 확인 완료'}
 else {sharedDirty=true;storeShared();again=true;sharedMessage='공유 기록 초기 저장 대기'}
 }
 }catch(e){if(e.message.includes('SYNC_CONFLICT')){sharedConflict=true;storeShared();sharedMessage='다른 기기와 기록 충돌 · 전체 백업 후 서버 기록 확인 필요'}else sharedMessage=e.message.includes('nutrition_shared')||e.message.includes('save_nutrition_shared')?'Supabase 설정 필요 · v5 SQL 파일을 실행해주세요.':'서버 저장 실패 · 기기에 보관 중 · 동기화로 재시도'}finally{sharedBusy=false;sharedPaint();if(again&&!sharedConflict)sharedTimer=setTimeout(()=>syncShared(),200)}
}
function switchProfile(id){if(!sharedBoard.profiles.some(p=>p.id===id))return;sharedBoard.profiles.find(p=>p.id===activeProfile).data=db;activeProfile=id;db=activeData();foodScreen=false;storeShared();render()}
function exportShared(){sharedBoard.profiles.find(p=>p.id===activeProfile).data=db;const blob=new Blob([JSON.stringify(sharedBoard,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='nutrition-all-profiles-'+dayKey()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
async function serverShared(){if(sharedBusy)return;if(!confirm('전체 백업을 먼저 받으셨나요? 미동기화 기록은 기기에 별도 보관한 뒤 서버 기록으로 전환합니다.'))return;sharedBusy=true;try{const records=await sharedApi('nutrition_shared?select=data,revision&board_id=eq.'+BOARD);if(!records.length||!validBoard(records[0].data))throw Error('서버 기록이 없습니다.');localStorage.setItem(SHARED_CACHE+'-conflict-'+Date.now(),JSON.stringify(sharedBoard));sharedBoard=records[0].data;sharedRevision=Number(records[0].revision);sharedDirty=false;sharedConflict=false;db=activeData();storeShared();render();sharedMessage='서버 기록으로 전환 완료'}catch(e){sharedMessage=e.message}finally{sharedBusy=false;sharedPaint()}}
document.addEventListener('click',e=>{
 const profile=e.target.closest('[data-profile]');if(profile){switchProfile(profile.dataset.profile);return}
 const b=e.target.closest('[data-shared]');if(!b)return;
 const a=b.dataset.shared;
 if(a==='sync')syncShared();else if(a==='backup')exportShared();else if(a==='restore')document.querySelector('#sharedImport').click();else if(a==='server')serverShared();
 else if(a==='add')modal('사람 추가',inp('이름','name','','text'),fd=>{const name=fd.get('name').trim();if(!name)throw Error('이름을 입력해주세요.');if(sharedBoard.profiles.some(p=>p.name===name))throw Error('이미 등록된 이름입니다.');const id=uid();sharedBoard.profiles.push({id,name,data:initial()});switchProfile(id);sharedSave()});
 else if(a==='rename')modal('이름 변경',inp('이름','name',sharedBoard.profiles.find(p=>p.id===activeProfile).name,'text'),fd=>{const name=fd.get('name').trim();if(!name)throw Error('이름을 입력해주세요.');if(sharedBoard.profiles.some(p=>p.id!==activeProfile&&p.name===name))throw Error('이미 등록된 이름입니다.');sharedBoard.profiles.find(p=>p.id===activeProfile).name=name;sharedSave()});
 else if(a==='legacy'){if(!confirm('이 기기의 이전 기록 중 없는 날짜·식품·목표·고정 식단을 조승구 프로필에 가져올까요? 같은 날짜는 현재 기록을 유지합니다.'))return;const old=legacyRecord(),p=sharedBoard.profiles.find(p=>p.id==='seunggu');if(!p)return toast('조승구 기본 프로필이 없습니다.');for(const [d,x] of Object.entries(old.days))if(!p.data.days[d])p.data.days[d]=x;for(const k of ['foods','templates'])for(const x of old[k])if(!p.data[k].some(v=>v.id===x.id))p.data[k].push(x);for(const g of old.goals)if(!p.data.goals.some(v=>v.from===g.from))p.data.goals.push(g);if(activeProfile===p.id)db=p.data;sharedSave();render();toast('이전 기록을 가져왔습니다.')}
});
window.addEventListener('online',()=>syncShared());window.addEventListener('focus',()=>syncShared());window.addEventListener('beforeunload',e=>{if(sharedDirty){e.preventDefault();e.returnValue=''}});
setInterval(()=>syncShared(),60000);render();syncShared();

document.addEventListener('change',async e=>{if(e.target.id!=='sharedImport')return;try{const value=JSON.parse(await e.target.files[0].text());if(!validBoard(value))throw Error('전체 백업 파일 형식을 확인해주세요.');if(!confirm('모든 사람의 기록을 백업 내용으로 교체할까요? 현재 기록은 기기에 별도 보관합니다.'))return;localStorage.setItem(SHARED_CACHE+'-before-import-'+Date.now(),JSON.stringify(sharedBoard));sharedBoard=value;db=activeData();sharedSave();render()}catch(err){toast(err.message)}});
