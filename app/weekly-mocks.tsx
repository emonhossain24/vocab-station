'use client';
import {useState,useEffect} from 'react';
import {Lock,ArrowRight,ChevronLeft,ChevronRight} from 'lucide-react';
import {passedAssessment,unlockedWeek} from './learning';
import {weekReady} from './daily-progress';
import type {Word} from './words';
export default function WeeklyMocks({labels={},state,words,config={},title,busy,onStart,onSample}:{labels?:Record<string,string>;state:any;words:Word[];config?:any;title?:string;busy:boolean;onStart:(week:number,revision?:boolean)=>void;onSample:()=>void}){
 const total=Math.ceil(state.track/14),items=Array.from({length:total},(_,i)=>({week:(i+1)*2,revision:false}));
 const stage=unlockedWeek(state.attempts),nextPosition=items.findIndex(x=>x.week===stage);
 const [position,setPosition]=useState(Math.max(0,nextPosition));useEffect(()=>setPosition(Math.max(0,nextPosition)),[nextPosition]);
 const index=Math.min(position,items.length-1),item=items[index],n=item.week,passed=passedAssessment(state.attempts,'Biweekly',n)||passedAssessment(state.attempts,'Weekly',n);
 const currentPolicy=config[String(n)]||config[String(n)+':Revision']||{};
 const assigned=state.assignedTest?.week===n&&['Biweekly','Weekly'].includes(state.assignedTest?.kind);
 const allowed=currentPolicy.enabled!==false&&(assigned||(n<=stage&&weekReady(words,state,n)));
 const passMark=currentPolicy.passPercent||90;
 const reason=currentPolicy.enabled===false?'Disabled by your administrator.':n>stage? `Pass the Weeks ${n-2}–${n-1} assessment first.`:`Mark every assigned word “I know this” across Days ${(n-2)*7+1}–${Math.min(state.track,n*7)}.`;
 return <section id="tests" className="weekly-mocks panel"><div className="section-heading"><div><h2>{title||'Two-week assessments'}</h2><p>{currentPolicy.questionCount||30} objective + 5 AI-scored writing questions · {Math.round((currentPolicy.timeSeconds||900)/60)} minutes · {passMark}% pass</p></div><button className="outline" disabled={busy} onClick={onSample}>{labels.sampleMock||'Try sample mock'}</button></div><div className="mock-carousel"><button className="outline" aria-label="Previous assessment" disabled={index===0} onClick={()=>setPosition(index-1)}><ChevronLeft size={20}/></button><article className={'sequence-card '+(passed?'passed':allowed?'ready':'locked')}><span className="pill">{passed?'Passed':allowed?'Available':'Locked'}</span><h3>Weeks {n-1}–{n} assessment</h3><p>Days {(n-2)*7+1}–{Math.min(state.track,n*7)} · {Math.min(14,state.track-(n-2)*7)} learning days</p><small>{passed?'Assessment passed. You can revisit it.':allowed?'Ready when you are.':reason}</small><button className="primary" disabled={busy||!allowed} onClick={()=>onStart(n,false)}>{passed?'Retake':labels.startMock||'Start assessment'}{allowed?<ArrowRight size={16}/>:<Lock size={16}/>}</button></article><button className="outline" aria-label="Next assessment" disabled={index===items.length-1} onClick={()=>setPosition(index+1)}><ChevronRight size={20}/></button></div><p className="future-mock-note">Assessment {index+1} of {items.length} · One assessment follows every 14 learning days. Pass at least {passMark}% to unlock the next block.</p>{state.assignedTest&&<button className="outline assigned-mock" disabled={busy} onClick={()=>onStart(state.assignedTest.week,false)}>Open assigned assessment</button>}</section>
}
