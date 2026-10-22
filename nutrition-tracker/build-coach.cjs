const fs=require('node:fs'),path=require('node:path'),root=__dirname,dir=path.join(root,'supabase/functions/health-access');
const analysis=fs.readFileSync(path.join(dir,'analysis.ts'),'utf8');
fs.writeFileSync(path.join(root,'coach-analysis.js'),"'use strict';\nconst CoachingAnalysis=(()=>{\n"+analysis.replace(/export /g,'')+"\nreturn {buildCoachInput,settings,COACH_VERSION};})();\n");
const strip=s=>s.replace(/^import .*?;\n/gm,'').replace(/^export \{.*?\} from .*?;\n/gm,'').replace(/export /g,'');
fs.writeFileSync(path.join(root,'health-access-v19-dashboard.ts'),[analysis,fs.readFileSync(path.join(dir,'coach.ts'),'utf8'),fs.readFileSync(path.join(dir,'index.ts'),'utf8')].map(strip).join('\n'));
console.log('Generated matching browser analytics and single-file backend');
