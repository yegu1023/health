/* Read database assets in the window so Android's asset interceptor handles them. */
function createFoodWorker(){
 const worker=new Worker('food-worker.js?v=19.3');
 worker.addEventListener('message',async event=>{
  const d=event.data;if(d.type!=='asset-request')return;event.stopImmediatePropagation();
  if(!/^data\/(manifest\.json|foods-\d{2}\.json\.gz)$/.test(d.path)){worker.postMessage({type:'asset-response',token:d.token,error:'잘못된 데이터 경로입니다.'});return}
  let error;
  for(let attempt=0;attempt<2;attempt++){
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
   try{const response=await fetch(d.path,{signal:controller.signal});if(!response.ok)throw Error('HTTP '+response.status);const bytes=await response.arrayBuffer();worker.postMessage({type:'asset-response',token:d.token,bytes},[bytes]);return}catch(e){error=e}finally{clearTimeout(timer)}
  }
  worker.postMessage({type:'asset-response',token:d.token,error:'식품 데이터 로딩 실패 ('+d.path.split('/').pop()+'). 검색을 다시 시도해주세요.'});
 });return worker;
}
