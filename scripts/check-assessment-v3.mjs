import {mockGeminiFetch} from './mock-gemini.mjs';
import {createRequire} from 'node:module';const nativeRequire=createRequire(import.meta.url);
import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import assert from 'node:assert/strict';import ts from 'typescript';
const cache=new Map(),records=new Map();let failNextBatch=false;let user={userId:'test-learner',email:'learner@example.invalid'};
const env={LEARNING_ENABLED:'true',GEMINI_API_KEY:'test-key-never-real',DB:{async batch(statements){if(failNextBatch){failNextBatch=false;throw Error('Temporary storage failure')}const snapshot=new Map(records);try{return await Promise.all(statements.map(s=>s.run()))}catch(e){records.clear();for(const [k,v] of snapshot)records.set(k,v);throw e}},prepare(sql){let args=[];const query={bind(...values){args=values;return query},async first(){return records.has(args[0])?{data:records.get(args[0])}:null},async run(){if(sql.startsWith('INSERT INTO records')){records.set(args[0],args[1]);return{meta:{changes:1}}}if(sql.startsWith('UPDATE records')){const record=JSON.parse(records.get(args[0])||'null');if(!record||record.used)return{meta:{changes:0}};records.set(args[0],JSON.stringify({...record,used:true}));return{meta:{changes:1}}}throw Error(sql)}};return query;}}};
function load(file){if(cache.has(file))return cache.get(file);if(file.endsWith('.json'))return JSON.parse(fs.readFileSync(file,'utf8'));if(file.endsWith('google-auth.ts'))return{getSignedInUser:async()=>user};const module={exports:{}};cache.set(file,module.exports);const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;vm.runInNewContext(js,{module,exports:module.exports,require:p=>p==='cloudflare:workers'?{env}:!p.startsWith('.')?nativeRequire(p):load(path.resolve(path.dirname(file),p)+(p.endsWith('.json')?'':'.ts')),Set,Map,RegExp,Date,Math,Response,Request,fetch:mockGeminiFetch,TextEncoder,TextDecoder,AbortSignal,Uint8Array,btoa,atob,crypto});return module.exports;}
const root=process.cwd(),learning=load(root+'/app/learning.ts'),api=load(root+'/app/api/tests/route.ts'),feedback=load(root+'/app/answer-feedback.ts');
assert.equal(learning.PASS_PERCENT,90);assert.equal(learning.TEST_SECONDS,900);
const passed=(week,kind='Weekly')=>({week,kind,score:27,total:30});
assert.equal(learning.unlockedWeek([{...passed(1),score:26}]),1);
assert.equal(learning.unlockedWeek([passed(1)]),2);
assert.equal(learning.unlockedWeek([passed(1),passed(2)]),2);
assert.equal(learning.revisionDue([passed(1),passed(2)]),2);
assert.equal(learning.unlockedWeek([passed(2),passed(4)]),6);
assert.equal(learning.unlockedWeek([passed(1),passed(2),passed(2,'Revision')]),3);
const request=d=>new Request('https://test.invalid/api/tests',{method:'POST',body:JSON.stringify(d),headers:{'Content-Type':'application/json'}});
async function post(d){const response=await api.POST(request(d));return{status:response.status,...await response.json()};}
assert.equal((await post({action:'start',week:2})).status,400);
assert.equal((await post({action:'startRevision',week:2})).status,400);
assert.equal((await post({action:'start',week:1})).status,400);const exam=await post({action:'practice',week:2});assert.equal(exam.status,200);assert.equal(exam.questions.length,35);assert.equal(exam.scoredQuestions,35);assert.equal(exam.questions.filter(q=>q.writing).length,5);
assert(exam.questions.every(q=>!('answer'in q)&&!('accepted'in q)&&!('explanation'in q)&&!('w'in q)));
const internal=JSON.parse(records.get('exam:test-learner:'+exam.id));const answers=Object.fromEntries(internal.q.map((q,i)=>[i,q.writing?'She go to school with '+q.w.word+'.':q.answer]));
const result=await post({action:'submit',id:exam.id,answers});assert.equal(result.status,200);assert.equal(result.total,35);assert.equal(result.score,35);assert.equal(result.passed,true);assert.equal(result.unlocksNextWeek,false);
assert.equal(result.details.filter(q=>q.scored===false).length,0);assert.equal(result.writingScore,5);assert(result.details.filter(q=>q.writing).every(q=>q.writingFeedback.grammarVerified===false));
const replay=await post({action:'submit',id:exam.id,answers:{}});assert.equal(replay.status,200);assert.equal(replay.id,result.id);assert.equal(replay.score,result.score);assert.equal(JSON.parse(records.get('test-learner')).attempts.length,1);
records.set('test-learner',JSON.stringify({track:120,attempts:[passed(1)]}));
assert.equal((await post({action:'start',week:2})).status,400);
assert.equal((await post({action:'startRevision',week:2})).status,400);const {seed,wordKey}=load(root+'/app/words.ts');assert(learning.wordsForWeek(seed,120,1).length>0);assert(learning.wordsForWeek(seed,120,2).length>0);
const spelling=feedback.answerFeedback({answer:'abandon',accepted:['abandon'],typed:true},'abandn');assert.equal(spelling.spellingSuggestion,'abandon');assert.match(spelling.feedback,/spelling/);
const writing=feedback.answerFeedback({writing:true,w:{word:'abandon'},answer:'We must never abandon our friends.'},'We never abandon our friends.');assert.equal(writing.correct,null);assert.equal(writing.scored,false);assert.match(writing.feedback,/not been verified/);
records.set('test-learner',JSON.stringify({banned:true}));assert.equal((await post({action:'start',week:1})).status,403);
user=null;assert.equal((await post({action:'start',week:1})).status,401);
console.log('Assessment v3 passed: 90% boundary, weekly and mandatory pair revision gates, 30 objective + 5 AI-scored writing, 15-minute server timer, I know this completion required for weekly start, practice preview available, answer secrecy, atomic replay guard, spelling feedback, honest sentence feedback, ban and auth.');

user={userId:'submission-check',email:'submission@example.invalid'};records.set(user.userId,JSON.stringify({track:120,attempts:[]}));const blankExam=await post({action:'practice',week:1});const blank=await post({action:'submit',id:blankExam.id,answers:{}});assert.equal(blank.status,200);assert.equal(blank.score,0);assert.equal(blank.total,35);assert.equal(blank.passed,false);assert.equal(blank.unlocksNextWeek,false);assert.equal(blank.details.filter(q=>!q.chosen).length,35);const retryExam=await post({action:'practice',week:1});failNextBatch=true;assert.equal((await post({action:'submit',id:retryExam.id,answers:{}})).status,400);assert.equal(JSON.parse(records.get('exam:'+user.userId+':'+retryExam.id)).used,false);assert.equal((await post({action:'submit',id:retryExam.id,answers:{}})).status,200);const before=JSON.parse(records.get(user.userId)).attempts.length;assert.equal((await post({action:'submit',id:retryExam.id,answers:{}})).status,200);assert.equal(JSON.parse(records.get(user.userId)).attempts.length,before);console.log('Blank submission, transactional storage failure recovery, idempotent result retrieval and no duplicate attempts passed.');

