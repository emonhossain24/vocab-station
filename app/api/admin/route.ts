import {env} from 'cloudflare:workers';
import {auth,readRecord,writeRecord,vocabulary,cleanWord,duplicates} from '../../data-server';
import {wordKey} from '../../words';
export async function GET(){const u=await auth();if(!u)return Response.json({error:'Sign in required'},{status:401});if(u.role!=='ADMIN')return Response.json({error:'Administrator access required'},{status:403});const rows=await env.DB!.prepare('SELECT id,student_id,username FROM accounts ORDER BY username LIMIT 1000').all<any>();const users=await Promise.all(rows.results.map(async a=>{const s=await readRecord(a.id,{});return{...s,contacts:await readRecord('contact:'+a.id,[]),personalWords:await readRecord('personal-words:'+a.id,[]),id:a.id,studentId:a.student_id,username:a.username,name:s.name||'Learner',school:s.school||'',exam:s.exam||'',start:s.start||'',adminDayAccess:s.adminDayAccess||{},adminWordDays:s.adminWordDays||{},adminExcludedWords:s.adminExcludedWords||[],adminCompletedDays:s.adminCompletedDays||[],track:s.track||120,mastered:s.mastered?.length||0,review:s.review?.length||0,activity:s.activity||{},attempts:s.attempts||[],practice:s.practice||[],logs:s.logs||[]}}));return Response.json({users,messages:await readRecord('announcements',[]),tests:await readRecord('test-config',{}),settings:await readRecord('site-settings-v1',{}),wordRequests:await readRecord('pending-word-requests-v1',[])});}
export async function POST(req:Request){const u=await auth();if(!u)return Response.json({error:'Sign in required'},{status:401});if(u.role!=='ADMIN')return Response.json({error:'Administrator access required'},{status:403});try{const d=await req.json() as any;
if(d.action==='siteSettings'){
 const current=await readRecord('site-settings-v1',{});
 const x=d.settings||{};
 const short=(v:any,n=160)=>String(v||'').trim().slice(0,n);
 const logo=short(x.logoUrl,220000);
 if(logo&&!((logo.startsWith('/')&&!logo.startsWith('//')&&!logo.includes('\\'))||
  /^https:\/\/[a-z0-9.-]+(?:\/[^\s]*)?$/i.test(logo)||
  /^data:image\/(?:png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(logo)))throw Error('Use HTTPS, a local asset path or a PNG/JPEG/WEBP image.');
 if(logo.length>220000)throw Error('Logo is too large.');
 const labelKeys=new Set(["know","review","hearWord","hearSentence","wordsMastered","todaysWords","learningStreak","currentWeek","target","daysRemaining","wordRecall","sentenceHint","wordTyping","sentenceTyping","listenType","checkAnswer","tryAgain","nextSentence","sampleMock","startMock","startRevision","submitTest","confirmSubmit","keepAnswering","nextWord","previousWord","learnDay","testHistory","practiceInstructions"]);
 const labels:any={};for(const [key,value] of Object.entries(x.labels||{})){if(labelKeys.has(key))labels[key]=short(value,180);}
 const fields:any={labels,siteTitle:short(x.siteTitle,80)||'Vocab Station',logoUrl:logo||'/logo.svg',
  tagline:short(x.tagline,180),heroTitle:short(x.heroTitle,150),about:short(x.about,2500),
  footer:short(x.footer,400),progressTitle:short(x.progressTitle,100),
  dailyTitle:short(x.dailyTitle,100),practiceTitle:short(x.practiceTitle,100),
  learningNotice:short(x.learningNotice,400),mockTitle:short(x.mockTitle,100)};
 await writeRecord('site-settings-v1',{...current,...fields,updatedAt:new Date().toISOString()});
 return Response.json({ok:true,settings:{...current,...fields}});
}
if(d.action==='approveWordRequest'||d.action==='rejectWordRequest'){
 const list:any[]=await readRecord('pending-word-requests-v1',[]);
 const request=list.find(x=>x.id===d.id&&x.status==='pending');
 if(!request)throw Error('Pending request not found.');
 if(d.action==='approveWordRequest'){
  const words=await vocabulary(request.userId);
  const w=cleanWord(request.word);
  if(duplicates(words,w))throw Error('Word already exists.');
  const personal=await readRecord('personal-words:'+request.userId,[]);
  await writeRecord('personal-words:'+request.userId,[...personal,w]);
 }
 await writeRecord('pending-word-requests-v1',list.map(x=>x.id===d.id?{...x,status:d.action==='approveWordRequest'?'approved':'rejected',reviewedAt:new Date().toISOString()}:x));
 return Response.json({ok:true});
}
if(['listQuestions','saveQuestion','deleteQuestion'].includes(d.action)){const week=Number(d.week);if(!Number.isInteger(week)||week<1||week>26)throw Error('Invalid week.');const kind=d.kind==='Revision'?'Revision':'Biweekly';if(kind==='Revision'&&week%2!==0)throw Error('Revision mocks use even-numbered weeks.');const key='custom-questions:'+week+(kind==='Revision'?':Revision':'');let questions=await readRecord(key,[]);if(d.action==='saveQuestion'){const q=d.question||{};const type=String(q.type||'ADMIN_CONTEXT_MCQ');
 const allowed=['ADMIN_CONTEXT_MCQ','TRUE_FALSE','FILL_BLANK','SHORT_ANSWER','WORD_MEANING','MULTI_SELECT','MEANING_MCQ','CLOZE_MCQ'];
 if(!allowed.includes(type)||!String(q.prompt||'').trim()||String(q.prompt).length>1500)throw Error('Select a valid question type and enter a prompt.');
 const typed=['FILL_BLANK','SHORT_ANSWER','WORD_MEANING'].includes(type);
 const choices=typed?[]:type==='TRUE_FALSE'?['True','False']:(Array.isArray(q.options)?q.options.map((x:any)=>String(x).trim()).filter(Boolean):[]);
 if(!typed&&(choices.length<2||choices.length>6||new Set(choices.map((x:string)=>x.toLowerCase())).size!==choices.length||choices.some((x:string)=>x.length>400)))throw Error('Provide 2–6 unique answer options.');
 const answers=type==='MULTI_SELECT'?String(q.answer||'').split('\u001F'):typed?[String(q.answer||'')]:[String(q.answer||'')];
 if(!answers.length||answers.some((x:string)=>!x.trim()||(!typed&&!choices.includes(x))))throw Error('Choose a valid correct answer.');
 if(!typed&&type!=='MULTI_SELECT'&&!choices.includes(String(q.answer||'')))throw Error('Choose a valid correct answer.');
 if(String(q.answer||'').length>600)throw Error('Answer is too long.');
if(!(await vocabulary(u.userId)).some(w=>(w.id||w.word)===q.wordId))throw Error('Choose an existing word.');const value={id:q.id||crypto.randomUUID(),wordId:q.wordId,type,prompt:String(q.prompt).trim(),hint:String(q.hint||'').slice(0,300),band:String(q.band||'').slice(0,100),required:q.required===true,options:choices,answer:String(q.answer),explanation:String(q.explanation||'').slice(0,1500)};questions=[...questions.filter((x:any)=>x.id!==value.id),value].slice(-60);await writeRecord(key,questions);}if(d.action==='deleteQuestion'){questions=questions.filter((q:any)=>q.id!==d.id);await writeRecord(key,questions);}return Response.json({questions});}if(d.action==='replyContact'){const messages=await readRecord('contact:'+String(d.userId),[]);const reply=String(d.reply||'').trim();if(!reply||reply.length>3000)throw Error('Write a reply up to 3000 characters.');if(!messages.some((m:any)=>m.id===d.id))throw Error('Message not found.');await writeRecord('contact:'+String(d.userId),messages.map((m:any)=>m.id===d.id?{...m,reply,replyDate:new Date().toISOString()}:m));return Response.json({ok:true});}if(d.action==='message'){const text=String(d.text||'').trim(),title=String(d.title||'Station update').trim();if(!text||text.length>4000||title.length>160)throw Error('Enter a message up to 4000 characters.');const key=d.userId?'messages:'+d.userId:'announcements';await writeRecord(key,[...(await readRecord(key,[])),{id:crypto.randomUUID(),title,text,date:new Date().toISOString()}].slice(-50));return Response.json({ok:true});}if(d.action==='testConfig'){const week=Number(d.week);if(!Number.isInteger(week)||week<1||week>26)throw Error('Choose a valid week.');const config=await readRecord('test-config',{});const configKey=String(week);config[configKey]={enabled:d.enabled!==false,title:String(d.title||`Weeks ${week-1}–${week} assessment`).slice(0,160),questionCount:Math.max(5,Math.min(60,Number(d.questionCount)||30)),timeSeconds:Math.max(60,Math.min(7200,Number(d.timeSeconds)||900)),passPercent:Math.max(1,Math.min(100,Number(d.passPercent)||90)),writingCount:5,requireAll:d.requireAll===true,showAnswers:d.showAnswers!==false};await writeRecord('test-config',config);return Response.json({ok:true});}const target=String(d.userId||'');if(!target)throw Error('Choose a learner.');const account=await env.DB!.prepare('SELECT * FROM accounts WHERE id=?').bind(target).first<any>();if(!account)throw Error('Learner not found.');if(target===u.userId&&['ban','delete'].includes(d.action))throw Error('You cannot disable your own administrator account.');const s=await readRecord(target,{});if(d.action==='ban')s.banned=!!d.value;else if(d.action==='delete'){s.deleted=true;s.banned=true;}else if(d.action==='restore'){s.deleted=false;s.banned=false;}else if(d.action==='update'){if(![120,150,180].includes(Number(d.track)))throw Error('Invalid track.');if(d.username){const username=String(d.username).toLowerCase().trim();if(!/^[a-z0-9_]{3,48}$/.test(username))throw Error('Invalid username.');try{await env.DB!.prepare('UPDATE accounts SET username=? WHERE id=?').bind(username,target).run();}catch{throw Error('Username is already taken.');}}s.name=String(d.name||'Learner').slice(0,100);s.school=String(d.school||'').slice(0,160);s.start=/^\d{4}-\d{2}-\d{2}$/.test(String(d.start||''))?String(d.start):s.start;s.track=Number(d.track);s.exam=String(d.exam||'').slice(0,10);s.milestones=Array.isArray(d.milestones)?d.milestones.filter((x:any)=>Number.isInteger(x)&&x>0&&x<=180):[];}else if(d.action==='wordProgress'){const word=(await vocabulary(target)).find(w=>(w.id||w.word)===d.wordId);if(!word)throw Error('Word not found.');const key=word.id||word.word;s.mastered=(s.mastered||[]).filter((x:string)=>x!==key);s.review=(s.review||[]).filter((x:string)=>x!==key);if(d.status==='mastered')s.mastered.push(key);else if(d.status==='review')s.review.push(key);else if(d.status!=='reset')throw Error('Choose a valid progress status.');}else if(d.action==='customExample'){
 const wordId=String(d.wordId||'');
 if(!(await vocabulary(target)).some(w=>wordKey(w)===wordId))throw Error('Word not found.');
 const extra=s.customExamples&&typeof s.customExamples==='object'?{...s.customExamples}:{};
 let entries=Array.isArray(extra[wordId])?[...extra[wordId]]:[];
 const index=Number(d.index);
 if(d.remove===true){
  if(!Number.isInteger(index)||index<0||index>=entries.length)throw Error('Sentence not found.');
  entries.splice(index,1);
 }else{
  const english=String(d.english||'').trim().slice(0,1500),bengali=String(d.bengali||'').trim().slice(0,1500);
  if(!english)throw Error('English sentence is required.');
  if(d.replace===true&&Number.isInteger(index)&&index>=0&&index<entries.length)entries[index]={english,bengali};
  else entries=[...entries,{english,bengali}].slice(-30);
 }
 extra[wordId]=entries;s.customExamples=extra;
}else if(d.action==='dayAccess'){
 const day=Number(d.day),mode=String(d.mode);
 if(!Number.isInteger(day)||day<1||day>Number(s.track||120)||!['allow','lock','default'].includes(mode))throw Error('Invalid day access.');
 s.adminDayAccess={...(s.adminDayAccess||{})};
 if(mode==='default')delete s.adminDayAccess[day];else s.adminDayAccess[day]=mode;
}else if(d.action==='dayCompletion'){
 const day=Number(d.day);
 if(!Number.isInteger(day)||day<1||day>Number(s.track||120))throw Error('Invalid day.');
 s.adminCompletedDays=[...new Set((s.adminCompletedDays||[]).filter((x:any)=>x!==day).concat(d.complete?[day]:[]))];
}else if(d.action==='assignWordDay'){
 const day=Number(d.day),key=String(d.wordId||'');
 if(!(await vocabulary(target)).some(w=>wordKey(w)===key))throw Error('Word not found.');
 if(!Number.isInteger(day)||day<0||day>Number(s.track||120))throw Error('Invalid learning day.');
 s.adminWordDays={...(s.adminWordDays||{})};
 if(day===0)delete s.adminWordDays[key];else s.adminWordDays[key]=day;
}else if(d.action==='bulkWords'){
 const day=Number(d.day),mode=String(d.mode||'assign');
 const tokens=String(d.words||'').split(/[\n,;]/).map(x=>x.trim().toLowerCase()).filter(Boolean);
 if(!['assign','exclude','restore'].includes(mode)||tokens.length<1||tokens.length>200)throw Error('Provide 1–200 vocabulary words or IDs.');
 if(mode==='assign'&&(!Number.isInteger(day)||day<1||day>Number(s.track||120)))throw Error('Choose a valid day.');
 const shared=await readRecord('shared-vocabulary-v2',[]);
 const personal=await readRecord('personal-words:'+target,[]);
 const available=[...shared,...personal];
 const resolved=tokens.map(t=>available.find((w:any)=>wordKey(w).toLowerCase()===t||w.word.toLowerCase()===t));
 const missing=tokens.filter((_,i)=>!resolved[i]);
 if(missing.length)throw Error('Unknown words: '+missing.slice(0,5).join(', '));
 const ids=[...new Set(resolved.map((w:any)=>wordKey(w)))];
 if(mode==='assign'){
  s.adminWordDays={...(s.adminWordDays||{})};
  for(const id of ids)s.adminWordDays[id]=day;
 }else{
  const excluded=new Set<string>(s.adminExcludedWords||[]);
  for(const id of ids){if(mode==='exclude')excluded.add(id);else excluded.delete(id);}
  s.adminExcludedWords=[...excluded];
 }
}else if(d.action==='excludeWord'){
 const key=String(d.wordId||'');
 const shared=await readRecord('shared-vocabulary-v2',[]);
 const personal=await readRecord('personal-words:'+target,[]);
 if(![...shared,...personal].some((w:any)=>wordKey(w)===key))throw Error('Word not found.');
 const previous=(s.adminExcludedWords||[]).filter((x:string)=>x!==key);
 s.adminExcludedWords=d.exclude?[...previous,key]:previous;
}else if(d.action==='overrideAttempt'){
 const id=String(d.attemptId||'');
 const attempt=(s.attempts||[]).find((a:any)=>a.id===id);
 if(!attempt)throw Error('Assessment attempt not found.');
 if(!['Weekly','Revision'].includes(attempt.kind))throw Error('Only weekly or revision assessments can be overridden.');
 s.attempts=(s.attempts||[]).map((a:any)=>a.id===id?{...a,adminOverride:d.approve===true,adminReviewedAt:new Date().toISOString()}:a);
}else if(d.action==='editPractice'){
 const index=Number(d.index),practice=[...(s.practice||[])];
 if(!Number.isInteger(index)||index<0||index>=practice.length)throw Error('Practice record not found.');
 const old=practice[index];
 practice[index]={...old,answer:String(d.answer??old.answer).slice(0,1500),correct:d.correct===true};
 s.practice=practice;
}else if(d.action==='deletePractice'){s.practice=(s.practice||[]).filter((_:any,i:number)=>i!==Number(d.index));}else if(d.action==='pass'){const week=Number(d.week);if(!Number.isInteger(week)||week<1||week>26||(d.kind==='Revision'&&week%2!==0))throw Error('Invalid week: revisions cover an even week pair.');s.attempts=[...(s.attempts||[]),{kind:d.kind==='Revision'?'Revision':'Weekly',week,score:30,total:30,passed:true,date:new Date().toISOString(),adminOverride:true}];}else if(d.action==='deleteAttempt'){s.attempts=(s.attempts||[]).filter((_:any,i:number)=>i!==Number(d.index));}else if(d.action==='assign'){s.assignedTest={week:Number(d.week),kind:d.kind==='Revision'?'Revision':'Weekly'};if(!Number.isInteger(s.assignedTest.week)||s.assignedTest.week<1||s.assignedTest.week>26)throw Error('Invalid week.');}else throw Error('Unsupported admin action.');s.logs=[...(s.logs||[]),`${new Date().toISOString()} · Administrator: ${d.action}`];await writeRecord(target,s);return Response.json({ok:true});}catch(e:any){return Response.json({error:e.message||'Update failed'},{status:400});}}

