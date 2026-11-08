'use client';
import { useMemo, useState } from 'react';
import { wordKey, type Word } from './words';

const questionTypes=[
 ['ADMIN_CONTEXT_MCQ','Multiple choice (MCQ)'],
 ['TRUE_FALSE','True / False'],
 ['FILL_BLANK','Fill in the blank (typed)'],
 ['SHORT_ANSWER','Vocabulary short answer'],
 ['WORD_MEANING','Word meaning (typed)'],
 ['MEANING_MCQ','Word meaning (MCQ)'],
 ['CLOZE_MCQ','Sentence completion (MCQ)'],
 ['MULTI_SELECT','Multiple correct answers']
];
const empty=()=>({id:'',wordId:'',prompt:'',type:'ADMIN_CONTEXT_MCQ',options:['','','',''],answer:'',band:'',hint:'',explanation:'',required:false});
export default function QuestionEditor({words}:{words:Word[]}){
 const [kind,setKind]=useState('Weekly'),[week,setWeek]=useState(1),[list,setList]=useState<any[]>([]),[edit,setEdit]=useState<any>(empty()),[search,setSearch]=useState(''),[status,setStatus]=useState(''),[loading,setLoading]=useState(false);
 const filtered=useMemo(()=>words.filter(w=>(w.word+' '+w.bengali_meaning).toLowerCase().includes(search.toLowerCase())).slice(0,50),[words,search]);
 const typed=['FILL_BLANK','SHORT_ANSWER','WORD_MEANING'].includes(edit.type);
 const multi=edit.type==='MULTI_SELECT';
 const trueFalse=edit.type==='TRUE_FALSE';
 const options=(trueFalse?['True','False']:edit.options)||[];
 async function call(action:string,extra:any={}){
  setLoading(true);setStatus('Saving…');
  try{
   const question={...edit,wordId:edit.wordId||wordKey(words[0]),options:trueFalse?['True','False']:typed?[]:edit.options.filter((x:string)=>x.trim()),answer:edit.answer};
   const r=await fetch('/api/admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,week,kind,question,...extra})});
   const d:any=await r.json();if(!r.ok)throw Error(d.error);
   setList(d.questions||[]);setStatus('Saved');
   if(action==='saveQuestion')setEdit(empty());
  }catch(e:any){setStatus(e.message||'Could not save question');}finally{setLoading(false);}
 }
 function changeType(value:string){
  setEdit((old:any)=>({...old,type:value,options:value==='TRUE_FALSE'?['True','False']:old.options.length<2?['','','','']:old.options,answer:''}));
 }
 function toggleAnswer(option:string,checked:boolean){
  const set=new Set(String(edit.answer||'').split('\u001F').filter(Boolean));
  if(checked)set.add(option);else set.delete(option);
  setEdit({...edit,answer:[...set].join('\u001F')});
 }
 return <section className="panel settings-panel admin-controls" id="admin-questions">
  <h2>Mock question bank · all question types</h2>
  <p>Publish questions, edit answers, choose mandatory or optional questions and set vocabulary-specific band labels. Admin questions replace generated questions in new attempts.</p>
  <div className="admin-edit-grid">
   <label>Assessment<select value={kind} onChange={e=>setKind(e.target.value)}><option>Weekly</option><option>Revision</option></select></label><label>Week<input min={1} max={26} type="number" value={week} onChange={e=>setWeek(Math.max(1,Math.min(26,Number(e.target.value)||1)))}/></label>
   <label>Question type<select value={edit.type} onChange={e=>changeType(e.target.value)}>{questionTypes.map(([v,t])=><option value={v} key={v}>{t}</option>)}</select></label>
  </div>
  <button className="outline" disabled={loading} onClick={()=>void call('listQuestions')}>Load saved {kind.toLowerCase()} questions for Week {week}</button>
  <label>Find linked vocabulary<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search English or Bengali word"/></label>
  <label>Linked word<select value={edit.wordId} onChange={e=>setEdit({...edit,wordId:e.target.value})}>
   <option value="">Select a word</option>{filtered.map(w=><option value={wordKey(w)} key={wordKey(w)}>{w.label||w.word} · {w.bengali_meaning}</option>)}
  </select></label>
  <label>Question / sentence prompt<textarea rows={3} maxLength={1500} value={edit.prompt} onChange={e=>setEdit({...edit,prompt:e.target.value})}/></label>
  <div className="admin-edit-grid">
   <label>Band / CEFR label<input maxLength={100} value={edit.band||''} onChange={e=>setEdit({...edit,band:e.target.value})}/></label>
   <label>Hint (optional)<input maxLength={300} value={edit.hint||''} onChange={e=>setEdit({...edit,hint:e.target.value})}/></label>
  </div>
  {typed?<label>Correct typed answer<input value={edit.answer} maxLength={600} onChange={e=>setEdit({...edit,answer:e.target.value})}/></label>:<>
   {options.map((o:string,i:number)=><label key={i}>Option {String.fromCharCode(65+i)}
    <div style={{display:'flex',gap:8,alignItems:'center'}}>
     <input disabled={trueFalse} value={o} onChange={e=>setEdit({...edit,options:options.map((x:string,j:number)=>i===j?e.target.value:x)})}/>
     {multi?<input type="checkbox" aria-label={'Correct '+o} checked={String(edit.answer||'').split('\u001F').includes(o)&&!!o} disabled={!o} onChange={e=>toggleAnswer(o,e.target.checked)}/>:<input type="radio" name="correct-option" aria-label={'Correct '+o} checked={edit.answer===o&&!!o} disabled={!o} onChange={()=>setEdit({...edit,answer:o})}/>}
    </div>
   </label>)}
   {!trueFalse&&options.length<6&&<button type="button" className="outline" onClick={()=>setEdit({...edit,options:[...options,'']})}>Add answer option</button>}
   {!trueFalse&&options.length>2&&<button type="button" className="text-button" onClick={()=>setEdit({...edit,options:options.slice(0,-1),answer:''})}>Remove last option</button>}
  </>}
  <label>Explanation shown after submission (if answer key is visible)<textarea rows={3} maxLength={1500} value={edit.explanation} onChange={e=>setEdit({...edit,explanation:e.target.value})}/></label>
  <label><input type="checkbox" checked={edit.required===true} onChange={e=>setEdit({...edit,required:e.target.checked})}/> This question must be answered before submission</label>
  <div className="practice-controls">
   <button className="primary" disabled={loading||!edit.prompt.trim()||!edit.wordId} onClick={()=>void call('saveQuestion')}>{edit.id?'Update question':'Add question'}</button>
   <button className="outline" onClick={()=>setEdit(empty())}>Clear editor</button>
  </div>
  <p role="status">{status}</p>
  <h3>Saved {kind.toLowerCase()} questions: {list.length}</h3>
  {list.map((q:any,i:number)=><article className="notice" key={q.id}>
   <strong>{i+1}. {q.prompt}</strong><p>{questionTypes.find(x=>x[0]===q.type)?.[1]||'MCQ'} · {q.required?'Required':'Optional'} · {q.band||'Inherited band'}</p>
   <p>{(q.options||[]).join(' · ')}</p><p>Correct answer: {String(q.answer||'').replaceAll('\u001F',', ')}</p>
   <div className="practice-controls">
    <button className="text-button" onClick={()=>{setEdit({...empty(),...q});setSearch(words.find(w=>wordKey(w)===q.wordId)?.word||'');document.getElementById('admin-questions')?.scrollIntoView({behavior:'smooth'})}}>Edit</button>
    <button className="text-button" disabled={loading} onClick={()=>{if(confirm('Delete this question?'))void call('deleteQuestion',{id:q.id})}}>Delete</button>
   </div>
  </article>)}
 </section>;
}
