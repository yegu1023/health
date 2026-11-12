'use strict';
// V21 changes presentation and access paths; it never migrates recorded meals or sets.
const v21FoodQty=new Map(),v21Focus=new Map(),v21EditOpen=new Map(),v21OtherOpen=new Map();
let v21Repeat=null,v21SearchLoading=false,v21SearchError='',v21SearchCount=0,v21LastLocalFailure='';
const v21SearchNorm=s=>String(s||'').toLowerCase().replace(/[\s_·-]/g,'');
const v21Context=()=>activeProfile+'/'+date;

// Save state is derived from actual local writes and acknowledged server responses.
function v21SyncKey(){return 'nutrition-last-server-v21-'+(accessSession?.profileId||'locked')}
function v21ServerStamp(){try{const x=JSON.parse(localStorage.getItem(v21SyncKey())||'null');return x&&Number.isFinite(Date.parse(x.at))?x:null}catch{return null}}
function v21StampText(){const s=v21ServerStamp();if(!s)return '아직 서버 저장을 확인하지 않았습니다.';const d=new Date(s.at);return '최근 서버 확인 '+d.toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false})}
function v21SyncState(){
 if(v21LastLocalFailure===(accessSession?.profileId||'locked'))return {kind:'error',title:'기기 저장 실패',detail:'저장 공간을 확인하고 백업해주세요.'};
 if(protectionBlocked)return {kind:'error',title:'기존 기록 보호 중',detail:'원본을 보관하고 기록을 확인해주세요.'};
 if(sharedConflict)return {kind:'error',title:'기기 기록 보관됨 · 동기화 확인 필요',detail:'기록이 달라 자동 덮어쓰기를 멈췄습니다.'};
 if(sharedBusy)return {kind:'pending',title:sharedDirty?'기기 저장됨 · 서버 저장 중':'서버 기록 확인 중',detail:v21StampText()};
 if(/자동 백업 저장/.test(sharedMessage))return {kind:'error',title:sharedDirty?'기기 저장됨 · 자동 백업 확인 필요':'자동 백업 확인 필요',detail:'현재 기록 백업으로 사본을 보관해주세요.'};
 if(/실패|오류|확인하지 못|접속 실패/.test(sharedMessage))return {kind:'error',title:sharedDirty?'기기 저장됨 · 서버 연결 확인 필요':'서버 연결 확인 필요',detail:v21StampText()};
 if(sharedDirty)return {kind:'pending',title:'기기 저장됨 · 서버 저장 대기',detail:v21StampText()};
 if(/서버 (저장|기록 확인) 완료/.test(sharedMessage))return {kind:'saved',title:'서버 저장됨',detail:v21ServerStamp()?v21StampText():'이번 접속에서 서버 기록을 확인했습니다.'};
 return {kind:'pending',title:'기기 기록 · 서버 확인 대기',detail:v21StampText()};
}
function v21SyncHTML(){const s=v21SyncState();return `<div class="v21-sync ${s.kind}" id="syncNotice" role="status"><div><b>${s.kind==='saved'?'✓ ':''}${esc(s.title)}</b><small>${esc(s.detail)}</small></div><button type="button" data-v21-sync-help>${s.kind==='error'?'확인·해결':'저장 확인'}</button></div>`}
cloudStatus=function(){return cloudStatusBeforeSync()+v21SyncHTML()};
showSyncNotice=function(){const node=document.querySelector('#syncNotice');if(node)node.outerHTML=v21SyncHTML()};
const v21BeforeSharedSave=sharedSave;
sharedSave=function(){const ok=v21BeforeSharedSave();v21LastLocalFailure=ok===false?(accessSession?.profileId||'locked'):'';showSyncNotice();return ok};
const v21BeforeSync=syncShared;
syncShared=async function(){const key=v21SyncKey();const ok=await v21BeforeSync();if(ok===true&&!sharedDirty&&!sharedConflict&&key===v21SyncKey()){v21LastLocalFailure='';try{localStorage.setItem(key,JSON.stringify({at:new Date().toISOString(),revision:sharedRevision}))}catch{}}showSyncNotice();return ok};
function v21SyncHelp(){const state=v21SyncState();viewerModal('기록 저장 확인',`<p><b>${esc(state.title)}</b></p><p>${esc(state.detail)}</p><p class="note">기기 저장은 지금 사용하는 휴대폰·PC에 보관됐다는 뜻입니다. 서버 저장이 끝나야 다른 기기에서 같은 기록을 받을 수 있습니다.</p>${sharedConflict?'<p>서로 다른 수정이 있어 양쪽 원본을 보관했습니다. 먼저 백업을 받고 관리에서 기록을 확인해주세요. 재시도만으로 한쪽 기록을 덮어쓰지는 않습니다.</p>':''}${v21LastLocalFailure===(accessSession?.profileId||'locked')?'<p>앱을 삭제하거나 저장 데이터를 지우지 마세요. 백업을 받은 뒤 기기의 저장 공간을 확인해주세요.</p>':''}<div class="actions"><button class="primary" data-v21-sync-retry>다시 동기화</button><button data-shared="backup">현재 기록 백업</button><button data-v21-sync-manage>관리에서 확인</button></div><details><summary>상세 상태</summary><p class="workout-note">${esc(sharedMessage)}</p></details>`)}

// Workout: the current exercise is the main view; configuration and editing are folded.
function v21HasPending(ex){return ex.muscle==='유산소'?!ex.cardio?.done:ex.sets.some(s=>!s.done)}
function v21ChooseFocus(day){const key=v21Context(),old=v21Focus.get(key);if(day.exercises.some(e=>e.id===old))return old;const ex=day.exercises.find(v21HasPending)||day.exercises[0];if(ex){v21Focus.set(key,ex.id);uiExerciseOpen.set(uiExerciseViewKey(ex.id),true)}return ex?.id}
function v21FocusExercise(id){if(!trainDay().exercises.some(e=>e.id===id))return;v21Focus.set(v21Context(),id);uiExerciseOpen.set(uiExerciseViewKey(id),true);render();document.querySelector('.v21-current')?.scrollIntoView?.({block:'start',behavior:'smooth'})}
function v21SetExerciseEditing(card,open){
 const trigger=card.querySelector('.v21-ex-tools'),panel=card.querySelector('.v21-ex-tool-buttons');
 const key=uiExerciseViewKey(trigger.dataset.ex);
 if(open)v21EditOpen.set(key,true);else v21EditOpen.delete(key);
 trigger.setAttribute('aria-expanded',String(open));panel.hidden=!open;card.classList.toggle('v21-editing',open);
}
function v21DecorateExercise(card,ex){
 const header=card.firstElementChild,oldTools=card.querySelector('.exercise-tools'),actions=card.querySelector(':scope > .actions');
 const tools=document.createElement('button');tools.type='button';tools.className='v21-ex-tools';tools.dataset.ex=ex.id;tools.textContent='⋯ 편집';tools.setAttribute('aria-label',ex.name+' 편집 도구');
 const panel=document.createElement('div');panel.className='v21-ex-tool-buttons';panel.id='v21-ex-panel-'+ex.id;tools.setAttribute('aria-controls',panel.id);
 const labels={exerciseUp:'↑ 종목 위로',exerciseDown:'↓ 종목 아래로',removeExercise:'종목 삭제'};
 for(const b of [...(oldTools?.querySelectorAll('button')||[]),...(actions?.querySelectorAll('button')||[])]){if(labels[b.dataset.w])b.textContent=labels[b.dataset.w];panel.append(b)}
 oldTools?.remove();actions?.remove();header.classList.add('v21-ex-heading');header.append(tools,panel);
 v21SetExerciseEditing(card,v21EditOpen.has(uiExerciseViewKey(ex.id)));
 for(const row of card.querySelectorAll('.workout-set:not(.header)')){const select=row.querySelector('[data-w-field="warmup"]');if(select){const number=document.createElement('span');number.className='v21-set-number';number.textContent=select.selectedOptions[0]?.textContent||'';row.prepend(number)}}
 const previous=card.querySelector(':scope > p.note');if(previous){const detail=document.createElement('details');detail.className='v21-previous';detail.innerHTML='<summary>지난 수행 기록 보기</summary>';previous.before(detail);detail.append(previous)}
 const upcoming=ex.sets.find(s=>!s.done);if(ex.muscle!=='유산소'){const next=document.createElement('p');next.className='v21-next-set';next.textContent=upcoming?'다음 '+(ex.sets.indexOf(upcoming)+1)+'세트 · '+(upcoming.weight==null?'중량 입력':fmt(upcoming.weight)+'kg')+' × '+(upcoming.reps==null?'횟수 입력':fmt(upcoming.reps)+'회'):'이 종목의 세트를 모두 완료했습니다.';const table=card.querySelector('.workout-set.header');if(table)table.before(next);else card.append(next)}
}
function v21WorkoutView(){
 if(tab!=='workout'||workoutView!=='log')return;const day=trainDay(),cards=[...document.querySelectorAll('.workout-exercise')];
 const tabs=document.querySelector('.workout-tabs');if(!tabs)return;
 const settings=document.createElement('details');settings.className='v21-session-settings';settings.innerHTML=`<summary>시간 ${esc(workoutTimeText(day))} · 휴식 ${restSeconds}초 <span>설정</span></summary>`;
 const time=document.querySelector('.workout-time'),timer=document.querySelector('.workout-timer');if(time)settings.append(time);if(timer)settings.append(timer);tabs.after(settings);
 const dayCard=document.querySelector('#workoutDayStatus')?.closest('.card'),footer=document.querySelector('[data-w="saveRoutine"]')?.parentElement;
 const tools=document.createElement('details');tools.className='v21-session-tools';tools.open=!cards.length;tools.innerHTML='<summary>루틴·기록 도구</summary>';
 if(dayCard){const title=document.createElement('div');title.className='v21-session-title';title.innerHTML=`<b>${esc(day.name)}</b><small>${day.status==='complete'?'운동 완료':day.exercises.length+'개 종목'}</small>`;settings.before(title);tools.append(dayCard)}
 const recovery=document.querySelector('[data-w="recoverChanges"]');if(recovery)tools.append(recovery);
 if(footer){for(const action of ['saveRoutine','deleteDay']){const b=footer.querySelector('[data-w="'+action+'"]');if(b)tools.append(b)}}
 settings.after(tools);
 const id=v21ChooseFocus(day),active=day.exercises.find(e=>e.id===id);cards.forEach((card,i)=>v21DecorateExercise(card,day.exercises[i]));
 if(active){const area=document.createElement('section');area.className='v21-current';area.innerHTML=`<div class="v21-current-label">지금 입력 · ${day.exercises.indexOf(active)+1} / ${day.exercises.length} 종목</div>`;tools.after(area);const card=cards[day.exercises.indexOf(active)];if(uiExerciseOpen.get(uiExerciseViewKey(active.id))){card.classList.remove('ui-ex-collapsed');card.querySelector('[data-ui-exercise]')?.setAttribute('aria-expanded','true')}area.append(card);
  const others=document.createElement('details');others.className='v21-other-exercises';others.open=!!v21OtherOpen.get(v21Context());others.innerHTML='<summary>다른 운동 보기 · '+(cards.length-1)+'개</summary>';cards.forEach((c,i)=>{const ex=day.exercises[i];if(ex.id===id)return;const choose=document.createElement('button');choose.className='v21-switch-exercise';choose.dataset.v21Focus=ex.id;choose.textContent='이 운동 입력';c.append(choose);others.append(c)});if(cards.length>1)area.after(others);const otherKey=v21Context();others.addEventListener('toggle',()=>v21OtherOpen.set(otherKey,others.open));
  if(!v21HasPending(active)){const next=day.exercises.find(e=>e.id!==id&&v21HasPending(e));if(next){const b=document.createElement('button');b.className='primary full v21-next-exercise';b.dataset.v21Focus=next.id;b.textContent='다음 운동 · '+next.name;area.append(b)}}
 }
 const exportButton=document.querySelector('[data-w="export"]');if(exportButton){const card=exportButton.closest('.card');if(card){const detail=document.createElement('details');detail.className='v21-export-tools';detail.innerHTML='<summary>코칭 기록 파일 내보내기</summary>';card.before(detail);detail.append(card)}}
}

// One search input, all sources by default; tabs narrow results only when requested.
function v21LocalFoodRows(){const q=v21SearchNorm(uiFoodQuery),match=r=>v21SearchNorm(r.food.name+' '+(r.food.maker||'')).includes(q);const mine=db.foods.map(food=>({key:foodHistoryKey(food),food,qty:foodDefaultQty(food),source:'내 식품'})),recent=recentFoodChoices().map(r=>({...r,source:'최근 기록'})),favorites=favoriteFoodChoices().map(r=>({...r,source:'즐겨찾기'}));const candidates=uiFoodTab==='mine'?mine:uiFoodTab==='favorites'?favorites:uiFoodTab==='recent'?recent:uiFoodTab==='all'?[...mine,...recent,...favorites]:[];return candidates.filter(match)}
function v21FoodChoices(){const seen=new Set(),rows=[...v21LocalFoodRows().slice(0,30)];if(uiFoodQuery.trim().length>=2&&['all','general','product'].includes(uiFoodTab))for(const a of uiFoodRows){const food=publicRecord(a);rows.push({key:foodHistoryKey(food),food,qty:foodDefaultQty(food),source:a[8]==='가공식품'?'제품':'일반 식품'})}return rows.filter(r=>{if(seen.has(r.key))return false;seen.add(r.key);return true}).slice(0,100)}
function v21FoodTabs(){const searching=!!uiFoodQuery.trim(),tabs=searching?[['all','전체'],['mine','내 식품'],['general','일반 식품'],['product','제품']]:[['recent','최근'],['favorites','즐겨찾기'],['mine','내 식품']];return tabs.map(([key,label])=>`<button type="button" data-v21-food-tab="${key}" class="${uiFoodTab===key?'selected':''}">${label}</button>`).join('')}
function v21RefreshFoodTabs(){const host=document.querySelector('.ui-food-tabs');if(host)host.innerHTML=v21FoodTabs()}
uiFoodResults=function(){const host=document.querySelector('#uiFoodResults');if(!host)return;const rows=v21FoodChoices();host.innerHTML=rows.map((r,i)=>{const selected=batchItems.find(f=>foodHistoryKey(f)===r.key),food=selected||r.food,qty=selected?.qty??v21FoodQty.get(r.key)??r.qty;return `<div class="ui-food-choice v21-food-choice"><div class="v21-food-info"><b>${esc(r.food.name.replace(/_/g,' · '))}</b><small class="v21-source">${esc(r.source)}</small><small data-v21-food-summary>${esc(nutritionText(food,qty))}</small><details><summary>영양정보</summary><p>${esc(foodBasisText(food))}${r.food.maker&&r.food.maker!=='해당없음'?' · '+esc(r.food.maker):''}</p><button type="button" class="link" data-v21-food-edit="${i}">이름·영양 기준 수정</button></details></div><label class="ui-choice-qty"><input type="number" inputmode="decimal" min="0.1" step="any" value="${qty}" data-ui-choice-qty="${i}" aria-label="${esc(r.food.name)} 섭취량">${esc(food.unit)}</label><button type="button" class="ui-choice-check ${selected?'selected':''}" data-v21-food-pick="${i}" aria-label="${esc(r.food.name)} ${selected?'선택 취소':'선택'}" aria-pressed="${!!selected}">${selected?'✓':'＋'}</button><button type="button" class="link v21-food-star" data-v21-food-star="${i}" aria-label="${esc(r.food.name)} 즐겨찾기">${(db.foodFavorites||[]).some(f=>f.key===r.key)?'★':'☆'}</button></div>`}).join('')||'<p class="empty">'+(v21SearchLoading?'내 기록에서 찾지 못했습니다. 식품 DB를 검색하고 있습니다…':uiFoodQuery.trim()?'검색 결과가 없습니다. 전체 필터로 찾거나 직접 입력해보세요.':'최근 기록이 없습니다. 위 검색창에서 음식 이름을 검색하세요.')+'</p>';
 host.querySelectorAll('[data-v21-food-pick]').forEach(b=>b.onclick=()=>{try{assertQuickFoodContext();const r=rows[+b.dataset.v21FoodPick],found=batchItems.findIndex(f=>foodHistoryKey(f)===r.key);if(found>=0)batchItems=batchItems.filter(f=>foodHistoryKey(f)!==r.key);else{const qty=+host.querySelector('[data-ui-choice-qty="'+b.dataset.v21FoodPick+'"]').value;stageFood(r.food,qty)}uiFoodResults();uiBasket()}catch(e){toast(e.message);if(/누락/.test(e.message))batchForm(rows[+b.dataset.v21FoodPick].food)}});
 host.querySelectorAll('[data-ui-choice-qty]').forEach(el=>el.oninput=()=>{const n=+el.value;if(!Number.isFinite(n)||n<=0)return;const r=rows[+el.dataset.uiChoiceQty];v21FoodQty.set(r.key,n);const selected=batchItems.find(f=>foodHistoryKey(f)===r.key);if(selected){selected.qty=n;uiBasket()}el.closest('.ui-food-choice').querySelector('[data-v21-food-summary]').textContent=nutritionText(selected||r.food,n)});
 host.querySelectorAll('[data-v21-food-edit]').forEach(b=>b.onclick=()=>{try{assertQuickFoodContext();const r=rows[+b.dataset.v21FoodEdit];batchForm(batchItems.find(f=>foodHistoryKey(f)===r.key)||r.food)}catch(e){toast(e.message)}});
 host.querySelectorAll('[data-v21-food-star]').forEach(b=>b.onclick=()=>{try{toggleFoodFavorite(rows[+b.dataset.v21FoodStar]);uiFoodResults()}catch(e){toast(e.message)}});
}
function v21FoodStatus(text,error=false){const el=document.querySelector('#uiSearchStatus');if(el){el.textContent=text;el.classList.toggle('danger',error)}const retry=document.querySelector('[data-v21-food-retry]');if(retry)retry.hidden=!error}
uiSearchFoods=function(){const q=uiFoodQuery.trim();uiRequest++;const id=uiRequest;uiFoodRows=[];v21SearchError='';v21SearchLoading=false;
 if(!q||!['all','general','product'].includes(uiFoodTab)){uiFoodResults();v21FoodStatus(q?'선택한 필터에서 검색합니다.':'검색어를 입력하면 모든 식품에서 찾습니다.');return}
 if(q.length<2){uiFoodResults();v21FoodStatus('DB 검색은 두 글자 이상 입력해주세요. 내 기록은 바로 검색합니다.');return}
 const ctx={profile:batchProfile,date:batchDate,meal:batchMeal};v21SearchLoading=true;uiFoodResults();v21FoodStatus('내 기록과 전체 식품 DB 검색 중…');
 try{if(!uiWorker)uiWorker=createFoodWorker();uiWorker.onmessage=({data})=>{if(!document.querySelector('#uiFoodResults')||ctx.profile!==batchProfile||ctx.date!==batchDate||ctx.meal!==batchMeal||activeProfile!==ctx.profile||date!==ctx.date)return;if(data.type==='progress'){if(id===uiRequest)v21FoodStatus('처음 검색 준비 중 · '+data.value+'%');return}if(data.id!==uiRequest)return;v21SearchLoading=false;if(data.type==='error'){v21SearchError=data.message;uiFoodRows=[];v21FoodStatus('DB를 불러오지 못했습니다. 내 기록은 계속 선택할 수 있습니다.',true);uiFoodResults();return}uiFoodRows=data.rows||[];v21SearchCount=data.count||0;v21FoodStatus('내 기록 '+v21LocalFoodRows().length+'개 · DB '+fmt(v21SearchCount)+'건 · 관련도순 표시');uiFoodResults()};uiWorker.onerror=()=>{if(id===uiRequest){v21SearchLoading=false;v21FoodStatus('DB 검색 준비 실패 · 다시 시도해주세요.',true);uiFoodResults()}uiWorker?.terminate();uiWorker=null};uiWorker.postMessage({q,id,category:uiFoodTab})}catch(e){v21SearchLoading=false;v21FoodStatus('DB 검색을 시작하지 못했습니다. 다시 시도해주세요.',true);uiFoodResults()}
}

// Reuse a past meal or a saved template in the existing staging basket, never auto-save.
function v21MealSources(meal){const past=[];for(const d of Object.keys(db.days).filter(d=>d<=date).sort().reverse()){const grouped=new Map();for(const f of db.days[d].items){if(!grouped.has(f.meal))grouped.set(f.meal,[]);grouped.get(f.meal).push(f)}for(const [m,items]of grouped){if(d===date&&m===meal)continue;past.push({key:d+'/'+m,label:d+' '+m,day:d,meal:m,items:structuredClone(items)})}}past.sort((a,b)=>Number(b.meal===meal)-Number(a.meal===meal)||b.day.localeCompare(a.day));return [...past.slice(0,40),...db.templates.map(t=>({key:'template/'+t.id,label:'고정 식단 · '+t.name,items:structuredClone(t.items)}))]}
function v21LoadRepeat(key){assertQuickFoodContext();const source=v21Repeat?.sources.find(s=>s.key===key);if(!source)throw Error('불러올 식사를 다시 선택해주세요.');const before=structuredClone(batchItems);try{batchItems=[];stagePreviousMeal(source);v21Repeat.key=key;v21Repeat.loaded=true}catch(e){batchItems=before;throw e}}
function v21OpenRepeat(meal){addFood(meal);const sources=v21MealSources(meal);if(!sources.length){toast('지난 식사나 고정 식단이 아직 없습니다. 음식부터 등록해주세요.');return}v21Repeat={profile:batchProfile,date:batchDate,meal,sources,key:sources[0].key};try{v21LoadRepeat(v21Repeat.key);showBatch()}catch(e){toast(e.message)}}
function v21RepeatHTML(){if(!v21Repeat||v21Repeat.profile!==activeProfile||v21Repeat.date!==date||v21Repeat.meal!==batchMeal)return '';return `<section class="v21-repeat-panel"><label>지난 식사·고정 식단<select id="v21RepeatSource">${v21Repeat.sources.map(s=>`<option value="${esc(s.key)}" ${s.key===v21Repeat.key?'selected':''}>${esc(s.label)} · ${s.items.length}개</option>`).join('')}</select></label><p>${v21Repeat.loaded?'지난 섭취량을 담았습니다. 아래 선택 목록에서 양을 바꾸고 저장하세요.':'불러올 식사를 고른 다음 선택한 식사 담기를 누르세요.'}</p><button type="button" id="v21RepeatLoad">선택한 식사 담기</button>${entry().items.some(f=>f.meal===batchMeal)?'<p class="danger">이 식사에 이미 기록이 있습니다. 저장하면 선택한 음식이 추가됩니다.</p>':''}</section>`}
showBatch=function(){const m=document.querySelector('#modal');m.classList.add('ui-food-modal','v21-food-modal');m.innerHTML=`<div class="row"><h2>${esc(batchMeal)} 음식 추가</h2><button id="uiFoodClose" aria-label="닫기">✕</button></div>${v21RepeatHTML()}<input id="uiFoodQuery" type="search" placeholder="음식·제품 이름을 검색하세요" aria-label="음식 검색" value="${esc(uiFoodQuery)}"><div class="ui-food-tabs">${v21FoodTabs()}</div><small id="uiSearchStatus" class="muted">검색어를 입력하면 모든 식품에서 찾습니다.</small><button class="link" data-v21-food-retry hidden>DB 검색 다시 시도</button><div id="uiFoodResults"></div><div class="actions"><button id="uiFoodDirect">직접 입력</button><button id="uiFoodCopy">지난 식사·고정 식단</button></div><div id="uiBasket"></div>`;if(!m.open)m.showModal();const close=()=>{if(batchItems.length&&!confirm('선택한 음식을 취소할까요?'))return;batchItems=[];v21Repeat=null;uiRequest++;clearTimeout(uiFoodTimer);m.close()};m.querySelector('#uiFoodClose').onclick=close;m.oncancel=e=>{e.preventDefault();close()};m.querySelector('#uiFoodQuery').oninput=e=>{uiFoodQuery=e.target.value;if(uiFoodQuery.trim()&&['recent','favorites'].includes(uiFoodTab))uiFoodTab='all';else if(!uiFoodQuery.trim()&&['all','general','product'].includes(uiFoodTab))uiFoodTab='recent';uiRequest++;clearTimeout(uiFoodTimer);uiFoodRows=[];v21RefreshFoodTabs();uiFoodResults();uiFoodTimer=setTimeout(uiSearchFoods,250)};m.querySelector('.ui-food-tabs').onclick=e=>{const b=e.target.closest('[data-v21-food-tab]');if(!b)return;uiFoodTab=b.dataset.v21FoodTab;uiRequest++;clearTimeout(uiFoodTimer);v21RefreshFoodTabs();uiSearchFoods()};m.querySelector('#uiFoodDirect').onclick=()=>batchForm({id:uid(),name:'',base:100,unit:'g',kcal:0,c:0,p:0,f:0,estimate:true});m.querySelector('#uiFoodCopy').onclick=()=>{if(!v21Repeat){const sources=v21MealSources(batchMeal);if(!sources.length)return toast('지난 식사나 고정 식단이 없습니다.');v21Repeat={profile:batchProfile,date:batchDate,meal:batchMeal,sources,key:sources[0].key}}showBatch();document.querySelector('#v21RepeatSource')?.focus()};m.querySelector('[data-v21-food-retry]').onclick=uiSearchFoods;
 const load=m.querySelector('#v21RepeatLoad');if(load)load.onclick=()=>{if(batchItems.length&&!confirm('현재 선택 목록을 선택한 식사로 바꿀까요?'))return;try{v21LoadRepeat(m.querySelector('#v21RepeatSource').value);showBatch()}catch(e){toast(e.message)}};const source=m.querySelector('#v21RepeatSource');if(source)source.onchange=()=>{const old=v21Repeat.key;if(batchItems.length&&!confirm('현재 선택 목록을 선택한 식사로 바꿀까요?')){source.value=old;return}try{v21LoadRepeat(source.value);uiFoodResults();uiBasket()}catch(e){source.value=old;toast(e.message)}};
 uiFoodResults();uiBasket();if(uiFoodQuery.trim())uiSearchFoods();
}
const v21BeforeAddFood=addFood;addFood=function(meal){v21Repeat=null;v21FoodQty.clear();v21SearchLoading=false;v21SearchError='';return v21BeforeAddFood(meal)};
function v21MealShortcuts(){if(tab!=='today')return;document.querySelectorAll('.ui-meal').forEach(section=>{const meal=section.querySelector('.ui-meal-toggle')?.dataset.uiMeal;if(!meal)return;const source=v21MealSources(meal).find(s=>s.meal===meal);const row=document.createElement('div');row.className='v21-meal-shortcut';row.innerHTML=`<button class="link" data-v21-repeat="${esc(meal)}">지난번처럼</button><small>${source?esc(source.label+' · '+source.items.length+'개'):'지난 식사·고정 식단 불러오기'}</small>`;section.querySelector('.ui-meal-line')?.after(row)})}

const v21BeforeRender=render;render=function(){v21BeforeRender();if(typeof accessReady!=='undefined'&&!accessReady)return;document.body.classList.add('ui-v21');v21WorkoutView();v21MealShortcuts();showSyncNotice()};
// Wait for the click so removing the inline panel doesn't move a touch target before activation.
document.addEventListener('click',e=>{
 const target=e.target;if(!(target instanceof Element))return;
 const trigger=target.closest('.v21-ex-tools'),card=target.closest('.workout-exercise');
 for(const openCard of document.querySelectorAll('.workout-exercise.v21-editing')){
  if(openCard!==card||!target.closest('.v21-ex-tools,.v21-ex-tool-buttons,[data-w-field="warmup"],.set-order button'))v21SetExerciseEditing(openCard,false);
 }
 if(trigger&&card)v21SetExerciseEditing(card,trigger.getAttribute('aria-expanded')!=='true');
},true);
document.addEventListener('keydown',e=>{
 if(e.key!=='Escape'||e.defaultPrevented||document.querySelector('#modal[open]'))return;
 const card=document.querySelector('.workout-exercise.v21-editing');
 if(card){v21SetExerciseEditing(card,false);card.querySelector('.v21-ex-tools').focus()}
});
document.addEventListener('click',e=>{const focus=e.target.closest('[data-v21-focus]');if(focus)return v21FocusExercise(focus.dataset.v21Focus);const repeat=e.target.closest('[data-v21-repeat]');if(repeat)return v21OpenRepeat(repeat.dataset.v21Repeat);if(e.target.closest('[data-v21-sync-help]'))return v21SyncHelp();if(e.target.closest('[data-v21-sync-retry]')){document.querySelector('#modal')?.close();syncShared();return}if(e.target.closest('[data-v21-sync-manage]')){document.querySelector('#modal')?.close();tab='manage';render()}});
document.addEventListener('change',e=>{if(!e.target.dataset.wField)return;const ex=trainDay().exercises.find(x=>x.id===e.target.dataset.ex),card=[...document.querySelectorAll('[data-ex-card]')].find(el=>el.dataset.exCard===ex?.id);const label=card?.querySelector('.v21-next-set'),next=ex?.sets.find(s=>!s.done);if(label&&next)label.textContent='다음 '+(ex.sets.indexOf(next)+1)+'세트 · '+(next.weight==null?'중량 입력':fmt(next.weight)+'kg')+' × '+(next.reps==null?'횟수 입력':fmt(next.reps)+'회')});
render();
