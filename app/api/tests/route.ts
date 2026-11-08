import {assessWriting,aiStatus,AssessmentUnavailable} from '../../gemini-assessment';
import {evaluateSentence} from '../../sentence-evaluator';
import {env} from 'cloudflare:workers';
import {auth,readRecord,writeRecord,vocabulary} from '../../data-server';
import {makeQuestions,sentenceQuestions} from '../../assessment';
import {answerFeedback} from '../../answer-feedback';
import {wordsForWeek,wordsForAssessmentBlock,unlockedWeek,passedAssessment,TEST_SECONDS,PASS_PERCENT,difficulty} from '../../learning';
import {weekReady} from '../../daily-progress';
import {wordKey} from '../../words';
export async function POST(req:Request){
 const u=await auth();if(!u)return Response.json({error:'Sign in required'},{status:401});
 if(env.LEARNING_ENABLED!=='true')return Response.json({error:'Assessments are not active yet.'},{status:403});
 let submissionLocked=false;
 try{
  const d=await req.json() as any;const state=await readRecord(u.userId,{});
  if(state.banned||state.deleted)return Response.json({error:'This learner account is not active.'},{status:403});
  if(['start','practice','startRevision','practiceRevision'].includes(d.action)){
   const week=Number(d.week),revision=d.action.endsWith('Revision'),practice=d.action.startsWith('practice');
   const words=await vocabulary(u.userId),track=state.track||120;
   const config=await readRecord('test-config',{});const options=config[String(week)]||config[String(week)+(revision?':Revision':'')]||{};if(options.enabled===false)throw Error('This assessment has been disabled by the administrator.');
   const assigned=Number(state.assignedTest?.week)===week&&['Biweekly','Weekly'].includes(state.assignedTest?.kind);
   if(!Number.isInteger(week)||week<2||week%2!==0||week>Math.ceil(track/14)*2)throw Error('Choose a valid two-week assessment block (Week 2, 4, 6…).');
   if(revision)throw Error('Separate revision tests are no longer used. Each assessment covers the previous 14 learning days.');
   if(!assigned&&week>unlockedWeek(state.attempts))throw Error('Pass the previous two-week assessment at 90% to unlock this block.');
   const pool=wordsForAssessmentBlock(words,track,week,state);
   if(!pool.length)throw Error('No vocabulary is assigned to this assessment.');
   if(!practice&&!assigned&&!weekReady(words,state,week))throw Error('Mark every assigned vocabulary word “I know this” across all 14 days before taking this assessment. Sentence writing and recall practice are optional.');
   const count=Math.max(5,Math.min(60,Number(options.questionCount)||30));
   const duration=Math.max(60,Math.min(7200,Number(options.timeSeconds)||TEST_SECONDS));
   const passPercent=Math.max(1,Math.min(100,Number(options.passPercent)||PASS_PERCENT));
   const writingCount=5;const scoringVersion='gemini-writing-v1';if(!practice){const status=await aiStatus();if(!status.enabled||!status.configured)throw new AssessmentUnavailable('AI-scored tests need the administrator to connect Gemini first. You can view the sample mock while setup is pending.');}
   const objective=makeQuestions(pool,count);
   if(objective.length!==count)throw Error('This assessment needs '+count+' distinct objective questions in the selected vocabulary. Reduce the question count or add more vocabulary.');
   const custom=await readRecord('custom-questions:'+week+(revision?':Revision':''),[]);
   const authored=custom.flatMap((item:any)=>{
    const w=pool.find(x=>wordKey(x)===item.wordId);
    if(!w)return [];
    const type=String(item.type||'ADMIN_CONTEXT_MCQ');
    const typed=['FILL_BLANK','SHORT_ANSWER','WORD_MEANING'].includes(type);
    const multi=type==='MULTI_SELECT';
    return [{w,typed,type,band:item.band||difficulty(w),prompt:item.prompt,
      required:item.required===true,hint:item.hint||undefined,answer:item.answer,
      accepted:[item.answer],options:typed?[]:(item.options||[]).slice().sort(()=>Math.random()-.5),
      multi,explanation:item.explanation}];
   });
   const selected=authored.length?[...authored.slice(0,count),...objective.filter((q:any)=>!authored.some((x:any)=>x.prompt===q.prompt)).slice(0,count-authored.length)]:objective;
   const q=[...selected.map((question:any)=>({...question,required:options.requireAll===true||question.required===true})),...sentenceQuestions(pool,writingCount).map(q=>({...q,required:options.requireAll===true}))],id=crypto.randomUUID(),kind=practice?'Practice':'Biweekly';
   await writeRecord('exam:'+u.userId+':'+id,{q,week,kind,revision,scoringVersion,objectiveCount:count,writingCount,started:Date.now(),timeSeconds:duration,passPercent,showAnswers:options.showAnswers!==false,title:options.title||`Weeks ${week-1}–${week} assessment`,used:false});await writeRecord(u.userId,{...state,assessmentSessions:[...(state.assessmentSessions||[]),{id,week,kind,date:new Date().toISOString()}].slice(-30)});
   return Response.json({id,kind,revision:false,title:options.title||`Weeks ${week-1}–${week} assessment`,seconds:duration,passPercent,writingCount,scoringVersion,objectiveQuestions:count,scoredQuestions:count+writingCount,questions:q.map(({w,answer,accepted,explanation,...safe})=>safe)});
  }
  if(d.action==='submit'){
   const key='exam:'+u.userId+':'+String(d.id),exam=await readRecord(key);
   if(!exam)throw Error('This exam session is unavailable.');
   const saved=await readRecord('test-feedback:'+u.userId+':'+String(d.id));if(saved)return Response.json(exam.showAnswers===false?hideAnswers(saved):saved);
   if(exam.used)throw Error('Your submission is being processed. Please retry in a few seconds to retrieve the result.');
   if(!exam.submission&&Date.now()-exam.started>((exam.timeSeconds||TEST_SECONDS)+30)*1000)throw Error('Exam time has expired.');if(exam.submission&&Date.now()-exam.submission.receivedAt>86400000)throw Error('The assessment retry period has expired.');
   submissionLocked=!!exam.submission;
   const selected=exam.submission?.answers||Object.fromEntries(exam.q.map((_:any,i:number)=>[i,String(d.answers?.[i]||'').slice(0,1500)]));
   const details=exam.q.map((q:any,i:number)=>answerFeedback(q,String(selected[i]||'').slice(0,1500)));
   if(exam.q.some((q:any,i:number)=>q.required===true&&!String(selected[i]||'').trim()))throw Error('Answer all required questions before submitting.');
   const aiScored=exam.scoringVersion==='gemini-writing-v1';
   if(aiScored){const writing=details.filter((q:any)=>q.writing&&q.chosen.trim());if(writing.length){const status=await aiStatus();if(!status.configured||!status.enabled)throw new AssessmentUnavailable('Gemini is not connected or is disabled. Your answers remain available; ask the administrator to connect it.');}if(!exam.submission){exam.submission={answers:selected,receivedAt:Date.now()};await writeRecord(key,exam);}submissionLocked=true;const assessments=writing.length?await assessWriting(writing.map((q:any,i:number)=>({id:String(i),text:q.chosen,word:q.w}))):[];let at=0;for(const detail of details){if(detail.writing){detail.scored=true;detail.maxScore=1;if(detail.chosen.trim()){const assessment=assessments[at++];detail.writingFeedback=assessment;detail.points=assessment.score;detail.correct=assessment.passed;detail.feedback=assessment.explanation;}else{detail.points=0;detail.correct=false;detail.feedback='No sentence submitted: 0/1 mark.';}}else detail.points=detail.correct?1:0;}}
   else {for(const detail of details){if(detail.writing&&detail.chosen.trim()){try{detail.writingFeedback=evaluateSentence(detail.chosen,detail.w);}catch{};}}}
   const scored=details.filter((q:any)=>q.scored),score=aiScored?scored.reduce((sum:number,q:any)=>sum+Number(q.points||0),0):scored.filter((q:any)=>q.correct).length,total=scored.length,passed=score/total*100>=Number(exam.passPercent||PASS_PERCENT);
   const attempt={id:String(d.id),date:new Date().toISOString(),kind:exam.kind||'Weekly',revision:!!exam.revision,week:exam.week,score,total,passPercentApplied:Number(exam.passPercent||PASS_PERCENT),scoringVersion:exam.scoringVersion||'legacy-objective',objectiveScore:details.filter((q:any)=>!q.writing&&q.correct).length,writingScore:aiScored?details.filter((q:any)=>q.writing).reduce((sum:number,q:any)=>sum+Number(q.points||0),0):0,writingTotal:aiScored?exam.writingCount:0,writingResponses:details.filter((q:any)=>q.writing&&q.chosen.trim()).length,passed,unlocksNextWeek:false};
   const latest=await readRecord(u.userId,{});const attempts=[...(latest.attempts||[]).filter((a:any)=>a.id!==attempt.id),attempt];attempt.unlocksNextWeek=exam.kind!=='Practice'&&unlockedWeek(attempts)>unlockedWeek(latest.attempts);
   const review=[...new Set([...(latest.review||[]),...details.filter((q:any)=>q.scored&&!q.correct).map((q:any)=>wordKey(q.w))])];
   const words=await vocabulary(u.userId),coveredVocabulary=wordsForAssessmentBlock(words,latest.track||120,exam.week,latest).length;
   const response={...attempt,details,coveredVocabulary,writingNotice:aiScored?'The total includes 30 objective questions and 5 AI-scored writing tasks. AI feedback can make mistakes.':'Legacy test: writing feedback does not affect the objective score.'};
   // Atomically consume the session so simultaneous submits cannot create duplicate attempts.
   const claim=await env.DB!.prepare("UPDATE records SET data=json_set(data,'$.used',json('true')) WHERE id=? AND json_extract(data,'$.used')=0").bind(key).run();
   if(!claim.meta?.changes)throw Error('This exam has already been submitted.');
   try{const sql='INSERT INTO records(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data';await env.DB!.batch([env.DB!.prepare(sql).bind(u.userId,JSON.stringify({...latest,attempts,review})),env.DB!.prepare(sql).bind('test-feedback:'+u.userId+':'+attempt.id,JSON.stringify(response))]);}catch(error){await writeRecord(key,{...exam,used:false}).catch(()=>{});throw error;}
   return Response.json(exam.showAnswers===false?hideAnswers(response):response);
  }
  throw Error('Unsupported exam action');
 }catch(e:any){return Response.json({error:e.message||'Exam could not be processed',answersLocked:submissionLocked},{status:e instanceof AssessmentUnavailable?503:400});}
}

export async function GET(req:Request){const u=await auth();if(!u)return Response.json({error:'Sign in required'},{status:401});const params=new URL(req.url).searchParams;const target=params.get('userId')||u.userId;if(target!==u.userId&&u.role!=='ADMIN')return Response.json({error:'Administrator access required'},{status:403});const state=await readRecord(u.userId,{});if(state.banned||state.deleted)return Response.json({error:'Account access disabled'},{status:403});if(params.has('bankWeek')||params.has('sessionId')){if(u.role!=='ADMIN')return Response.json({error:'Administrator access required'},{status:403});if(params.has('sessionId')){const exam=await readRecord('exam:'+target+':'+params.get('sessionId'));return exam?Response.json({questions:exam.q,kind:exam.kind,week:exam.week}):Response.json({error:'Paper unavailable'},{status:404});}const week=Number(params.get('bankWeek')),track=Number(params.get('track')||120);if(![120,150,180].includes(track)||!Number.isInteger(week)||week<1||week>Math.ceil(track/7))return Response.json({error:'Invalid week or plan'},{status:400});const targetState=await readRecord(target,{});const pool=wordsForWeek(await vocabulary(target),track,week,targetState);const custom=await readRecord('custom-questions:'+week,[]);const questions=[...custom.flatMap((q:any)=>{const w=pool.find(w=>wordKey(w)===q.wordId);return w?[{...q,w,type:'ADMIN_CONTEXT_MCQ',band:difficulty(w)}]:[]}),...makeQuestions(pool,30),...sentenceQuestions(pool)];return Response.json({questions,week,track,preview:true});}const result=await readRecord('test-feedback:'+target+':'+String(params.get('id')));const session=await readRecord('exam:'+target+':'+String(params.get('id')));return result?Response.json(u.role==='ADMIN'||session?.showAnswers!==false?result:hideAnswers(result)):Response.json({error:'Feedback is unavailable for this assessment.'},{status:404});}

function hideAnswers(result:any){
 const safe={...result};
 safe.details=(result.details||[]).map((q:any)=>{
  const {w,answer,accepted,explanation,reference,spellingSuggestion,feedback,...publicDetails}=q;
  return {...publicDetails,feedback:'Answer key hidden by your administrator.'};
 });
 safe.writingNotice='Your submission is saved. Correct answers are hidden by the administrator.';
 return safe;
}

