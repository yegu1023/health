'use strict';
function syncEqual(a,b){const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;return JSON.stringify(canonical(a))===JSON.stringify(canonical(b))}
function syncClone(x){return x===undefined?undefined:structuredClone(x)}
const syncArrayKeys={profiles:'id',foods:'id',templates:'id',goals:'from',routines:'id',customExercises:'name',sets:'id',exercises:'id',items:'id',photos:'id',foodFavorites:'key',drinks:'id'};
function mergeSyncValue(base,local,remote,path='',conflicts=[]){
 if(syncEqual(local,remote))return syncClone(local);
 if(syncEqual(local,base))return syncClone(remote);
 if(syncEqual(remote,base))return syncClone(local);
 const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
 if(object(local)&&object(remote)&&(base===undefined||object(base))){const out={};for(const key of new Set([...Object.keys(base||{}),...Object.keys(local),...Object.keys(remote)])){const value=mergeSyncValue(base?.[key],local[key],remote[key],path+'/'+key,conflicts);if(value!==undefined)out[key]=value}return out}
 const field=path.split('/').at(-1),key=syncArrayKeys[field];
 if(Array.isArray(base)&&Array.isArray(local)&&Array.isArray(remote)&&key&&[base,local,remote].every(a=>a.every(x=>x&&x[key]!==undefined)&&new Set(a.map(x=>x[key])).size===a.length)){
  const bm=new Map(base.map(x=>[x[key],x])),lm=new Map(local.map(x=>[x[key],x])),rm=new Map(remote.map(x=>[x[key],x]));
  const commonOrder=a=>a.filter(x=>bm.has(x[key])).map(x=>x[key]);const bo=base.map(x=>x[key]),lo=commonOrder(local),ro=commonOrder(remote);const localReorder=!syncEqual(lo,bo.filter(id=>lm.has(id))),remoteReorder=!syncEqual(ro,bo.filter(id=>rm.has(id)));
  if(localReorder&&remoteReorder&&!syncEqual(lo,ro))conflicts.push(path+'/순서');
  const ordering=localReorder?local:remote;const ids=[...new Set([...ordering.map(x=>x[key]),...local.map(x=>x[key]),...remote.map(x=>x[key]),...bo])],out=[];
  for(const id of ids){const value=mergeSyncValue(bm.get(id),lm.get(id),rm.get(id),path+'/'+id,conflicts);if(value!==undefined)out.push(value)}return out;
 }
 conflicts.push(path||'/');return syncClone(local);
}
function mergeSyncBoards(base,local,remote){const conflicts=[];const board=mergeSyncValue(base,local,remote,'',conflicts);if(!validBoard(board))conflicts.push('/기록 형식');return {board,conflicts}}
function archiveSyncState(reason,local,remote){const key='nutrition-sync-recovery-v16',previous=JSON.parse(localStorage.getItem(key)||'[]');if(!Array.isArray(previous))throw Error('동기화 자동백업 형식 오류');localStorage.setItem(key,JSON.stringify([{at:new Date().toISOString(),reason,local:syncClone(local),remote:syncClone(remote)},...previous].slice(0,8)))}
function syncConflictText(paths){return '같은 기록이 양쪽에서 변경됐습니다 · 자동 덮어쓰기 중지 · '+paths.slice(0,2).map(p=>p.replace('/profiles/','사람/').replace('/data/','/').replace('/training/days/','/운동/').replace('/days/','/식단/')).join(', ')+' · 전체 백업을 보관해주세요.'}
function showSyncNotice(){const node=document.querySelector('#syncNotice');if(node)node.textContent=sharedMessage}
const cloudStatusBeforeSync=cloudStatus;cloudStatus=function(){return cloudStatusBeforeSync()+`<div class="sync-status ${sharedConflict?'danger':''}" id="syncNotice" role="status">${esc(sharedMessage)}</div>`};
const sharedPaintBeforeSync=sharedPaint;sharedPaint=function(){sharedPaintBeforeSync();showSyncNotice()};
syncShared=async function(){
 if(typeof accessSession!=='undefined'&&!accessSession){sharedMessage='이름과 비밀번호로 접속해주세요.';sharedPaint();return false}
 if(sharedBusy){sharedMessage='동기화 진행 중입니다. 잠시 기다려주세요.';sharedPaint();return false}
 if(typeof protectionBlocked!=='undefined'&&protectionBlocked){sharedMessage='기존 기록 보호 중 · 전체 백업을 보관해주세요.';sharedPaint();return false}
 sharedBusy=true;sharedMessage='서버와 기록 비교 중…';sharedPaint();let success=false;
 try{
  for(let attempt=0;attempt<3;attempt++){
   const generation=sharedGeneration,records=await sharedApi('nutrition_shared?select=data,revision&board_id=eq.'+BOARD);
   if(!records.length||!validBoard(records[0].data))throw Error('서버 기록을 확인하지 못했습니다. 기기 기록은 유지합니다.');
   const remote=records[0].data,revision=Number(records[0].revision);
   if(!sharedDirty){if(sharedGeneration!==generation)continue;if(document.querySelector('#modal')?.open||document.activeElement?.matches?.('input,textarea,select')){sharedMessage='입력 중 · 현재 화면 유지, 다음 동기화에서 갱신';return false}sharedBoard=syncClone(remote);syncBaseline=syncClone(remote);sharedRevision=revision;sharedConflict=false;db=activeData();storeShared();sharedMessage='서버 기록 확인 완료';render();success=true;break}
   const local=syncClone(sharedBoard),merged=mergeSyncBoards(syncBaseline||undefined,local,remote);
   if(merged.conflicts.length){archiveSyncState('충돌 · 양쪽 원본 보관',local,remote);sharedConflict=true;sharedMessage=syncBaseline?syncConflictText(merged.conflicts):'이전 버전의 미동기화 기록이 있습니다 · 기기 원본 유지 · 통합 백업 가져오기로 복원해주세요.';storeShared();return false}
   archiveSyncState('서버 저장 직전',local,remote);
   let rev;try{rev=await sharedApi('rpc/save_nutrition_shared',{p_board:BOARD,p_data:merged.board,p_revision:revision})}catch(e){if(e.message.includes('SYNC_CONFLICT')&&attempt<2)continue;throw e}
   const current=syncClone(sharedBoard),rebased=mergeSyncBoards(local,current,merged.board);sharedRevision=Number(rev);
   if(rebased.conflicts.length){syncBaseline=local;sharedDirty=true;sharedConflict=true;sharedMessage=syncConflictText(rebased.conflicts);storeShared();return false}
   sharedBoard=rebased.board;syncBaseline=syncClone(merged.board);db=activeData();sharedDirty=!syncEqual(sharedBoard,merged.board);sharedConflict=false;storeShared();sharedMessage=sharedDirty?'추가 입력 저장 대기':'서버 저장 완료';if(!document.querySelector('#modal')?.open&&!document.activeElement?.matches?.('input,textarea,select'))render();success=!sharedDirty;if(sharedDirty)continue;break;
  }
  if(sharedDirty&&!sharedConflict){sharedMessage='다른 기기 입력과 비교 중 · 잠시 후 자동 재시도';clearTimeout(sharedTimer);sharedTimer=setTimeout(()=>syncShared(),1500)}
 }catch(e){sharedMessage='동기화 실패 · 기기 기록 유지 · '+e.message;try{storeShared()}catch{}}finally{sharedBusy=false;sharedPaint()}return success;
};
function overlayImportedBoard(server,imported){const out=syncClone(server);for(const p of imported.profiles){const at=out.profiles.findIndex(x=>x.id===p.id);if(at<0){out.profiles.push(syncClone(p));continue}const old=out.profiles[at].data,next=syncClone(p),d=next.data;d.days={...old.days,...d.days};for(const field of ['foods','templates','goals']){const key=syncArrayKeys[field],items=new Map(old[field].map(x=>[x[key],x]));for(const x of d[field])items.set(x[key],x);d[field]=[...items.values()]}if(old.training){d.training=d.training||syncClone(old.training);d.training.days={...old.training.days,...d.training.days}}if(old.health){d.health=d.health||syncClone(old.health);d.health.weights={...old.health.weights,...d.health.weights}}out.profiles[at]=next}return out}
// Capture the import event before the v14 listener; use a fresh server revision and retain server-only profiles/dates.
document.addEventListener('change',async e=>{if(e.target.id!=='sharedImport')return;e.stopImmediatePropagation();let ownsBusy=false;try{const incoming=JSON.parse(await e.target.files[0].text());if(!validBoard(incoming))throw Error('전체 백업 파일 형식을 확인해주세요.');if(sharedBusy)throw Error('동기화가 끝난 뒤 다시 가져와주세요.');if(!confirm('백업의 기록을 가져올까요? 같은 날짜는 백업을 적용하고, 서버에만 있는 사람·날짜는 유지합니다. 변경 전 양쪽 원본도 보관합니다.'))return;sharedBusy=true;ownsBusy=true;const records=await sharedApi('nutrition_shared?select=data,revision&board_id=eq.'+BOARD);if(!records.length||!validBoard(records[0].data))throw Error('서버 기록 확인 실패');const remote=records[0].data;archiveSyncState('백업 가져오기 전',sharedBoard,remote);const next=overlayImportedBoard(remote,incoming);if(!validBoard(next))throw Error('통합 기록 형식 오류');syncBaseline=syncClone(remote);sharedRevision=Number(records[0].revision);sharedBoard=next;db=activeData();sharedDirty=true;sharedConflict=false;sharedGeneration++;storeShared();sharedMessage='통합 백업 적용 · 서버 저장 대기';render();toast('백업을 적용했습니다. 서버 저장 상태를 확인해주세요.')}catch(err){toast(err.message);sharedMessage=err.message}finally{if(ownsBusy)sharedBusy=false;sharedPaint();e.target.value=''}if(sharedDirty&&!sharedConflict)await syncShared()},true);
window.addEventListener('pageshow',()=>syncShared());document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')syncShared()});
