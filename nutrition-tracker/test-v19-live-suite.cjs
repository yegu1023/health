// Optional real-model tests using synthetic records only. No user records or embedded API key.
const {coach}=require('./supabase/functions/health-access/coach.ts'),fs=require('node:fs');if(!process.env.GEMINI_API_KEY)throw Error('GEMINI_API_KEY required');global.Deno={env:{get:k=>process.env[k]}};global.crypto=require('node:crypto').webcrypto;const network=fetch;global.fetch=async(url,opt)=>url.includes('generativelanguage.googleapis.com')?network(url,opt):{ok:true,json:async()=>({status:'reserved'})};
const on='2026-10-28',set=(rir=2,reps=10,weight=50,warmup=false)=>({done:true,warmup,weight,reps,rir}),ex=(name='케이블 로우',sets=[set(),set(),set()],muscle='등')=>({name,muscle,sets}),w=(exercises=[ex()],name='Pull A')=>({name,status:'complete',pain:0,duration:60,exercises});
function base(){return {coachConsent:{geminiV1:true},coachSettings:{goalType:'gain'},goals:[{from:'2000-01-01',kcal:2500,c:300,p:150,f:70,water:2000}],days:{[on]:{complete:true,water:[],items:[{name:'합성 식사',meal:'점심',unit:'g',base:100,qty:100,kcal:2500,c:300,p:150,f:70}]}},health:{heightCm:175,weights:{}},training:{days:{[on]:w(),'2026-10-20':w()}}}}
function fill(d,kcal=2100,c=250){for(let n=0;n<28;n++){const dt=new Date(Date.parse(on+'T12:00:00Z')-n*86400000).toISOString().slice(0,10);d.days[dt]=structuredClone(d.days[on]);d.days[dt].items[0].kcal=kcal;d.days[dt].items[0].c=c}return d}function weights(d,delta=0){for(const [i,dt]of ['2026-10-01','2026-10-05','2026-10-10','2026-10-16','2026-10-21','2026-10-28'].entries())d.health.weights[dt]=i<3?76:76+delta}
const scenarios=[
 ['W1 RIR 개선','workout',d=>d.training.days[on].exercises[0].sets.forEach(s=>s.rir=3)],
 ['W2 반복 RIR0와 세트 수행 하락','workout',d=>d.training.days[on].exercises[0].sets=[set(0,12),set(0,10),set(0,8)]],
 ['W3 마지막 종목과 선행 피로','workout',d=>{d.training.days[on].exercises.push(ex('리버스 펙덱',[set(2,10,30)],'어깨'));d.training.days['2026-10-20'].exercises.unshift(ex('리버스 펙덱',[set(2,10,40)],'어깨'))}],
 ['W4 준비세트와 본세트·미입력 RIR','workout',d=>d.training.days[on].exercises[0].sets=[set(0,20,20,true),set(null),set(2)]],
 ['W5 A/B 루틴 분리','workout',d=>d.training.days['2026-10-27']=w([ex('케이블 로우',[set(0,20,100)])],'Pull B')],
 ['W6 첫 기록','workout',d=>delete d.training.days['2026-10-20']],
 ['W7 세션 통증','workout',d=>d.training.days[on].pain=4],
 ['N1 하루 열량 부족','diet',d=>d.days[on].items[0].kcal=1800],
 ['N2 7일 평균 부족','diet',d=>fill(d)],
 ['N3 단백질 충족·탄수 부족','diet',d=>fill(d,2300,200)],
 ['N4 평일 충족·주말 부족','diet',d=>{fill(d,2500,300);for(const [dt,x]of Object.entries(d.days))if([0,6].includes(new Date(dt+'T12:00:00Z').getUTCDay()))x.items[0].kcal=1700}],
 ['N5 2주 체중 정체','diet',d=>{fill(d);weights(d)}],
 ['N6 일부만 기록된 식단','diet',d=>{fill(d);for(const dt of ['2026-10-26','2026-10-27'])d.days[dt].complete=false;d.days[on].items=[{...d.days[on].items[0],name:'기록한 한 끼',kcal:600}]}],
 ['I1 섭취 부족·수행 하락','workout',d=>{fill(d);d.training.days[on].exercises[0].sets=[set(0,8),set(0,7),set(0,6)]}],
 ['I2 체중·수행 증가','workout',d=>{fill(d,2500,300);weights(d,.3);d.training.days[on].exercises[0].sets=[set(2,12),set(2,12),set(2,12)]}],
 ['I3 고볼륨·반복 RIR0','workout',d=>d.training.days[on].exercises[0].sets=Array.from({length:24},(_,i)=>set(0,i>12?8:10))]
];
(async()=>{const results=[];for(const [name,kind,setup]of scenarios){const data=base();setup(data);const r=await coach({payload:{kind,profileId:'synthetic',date:on}},async a=>a==='identity'?{role:'member',profileId:'synthetic'}:{data:{profiles:[{id:'synthetic',data}]}},'https://synthetic.test',{});results.push({name,status:r.status,feedback:r.value.feedback||null,error:r.value.error||null});console.log(name+': '+r.status);if(r.status===429){console.log('Rate limit: suite stopped without retries');break}}fs.writeFileSync('nutrition-tracker/v19-live-suite-results.json',JSON.stringify({notice:'합성 기록 Gemini 실제 호출. DB 읽기·예약·저장은 모의 처리; 운영 기록 미사용.',results},null,2));if(results.length!==16||results.some(r=>r.status!==200))process.exitCode=1})().catch(e=>{console.error(e.message);process.exit(1)});
