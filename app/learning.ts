import {assignedDay,wordKey,type Word} from './words';
export const TEST_SECONDS=900;
export const PASS_PERCENT=90;
export function passedAssessment(attempts:any[]=[],kind='Weekly',week=1){return attempts.some(a=>a.kind===kind&&a.week===week&&(a.adminOverride===true||(a.adminOverride!==false&&a.total>0&&a.score/a.total*100>=Math.max(1,Math.min(100,Number(a.passPercentApplied)||PASS_PERCENT)))));}
/** A passed assessment unlocks the next 14-day vocabulary block. */
export function unlockedWeek(attempts:any[]=[]){let week=2;while(passedAssessment(attempts,'Weekly',week)||passedAssessment(attempts,'Biweekly',week))week+=2;return week;}
export function revisionDue(attempts:any[]=[]){const week=unlockedWeek(attempts);return week%2===0&&passedAssessment(attempts,'Weekly',week)&&!passedAssessment(attempts,'Revision',week)?week:null;}
export function wordsForWeek(words:Word[],track:number,week:number,state:any={}){return words.filter((w,i)=>Math.ceil((Number(state.adminWordDays?.[wordKey(w)])||assignedDay(i,track,words.length))/7)===week);}
/** One assessment covers two completed seven-day learning weeks. `week` is the ending week number (2, 4, 6…). */
export function wordsForAssessmentBlock(words:Word[],track:number,week:number,state:any={}){if(!Number.isInteger(week)||week<2||week%2!==0)return [];return [...wordsForWeek(words,track,week-1,state),...wordsForWeek(words,track,week,state)];}
export function difficulty(w:Word){const d=w.source_details||'';const level=d.match(/\b[A-C][12]\b/)?.[0];const label= /C[12]/.test(d)?'Band 7–8 practice':/B2/.test(d)?'Band 6–7 practice':/B1/.test(d)?'Band 5–6 practice':/A[12]/.test(d)?'Band 4–5 practice':'Band 6–8 practice';return w.band_label|| (level?`${level} · ${label}`:label);}
export function resultMetrics(text:string,target:string,ms:number){const seconds=Math.max(.1,ms/1000);let correct=0;for(let i=0;i<text.length;i++)if(text[i]===target[i])correct++;return{seconds:Math.round(seconds*10)/10,wpm:Math.round(text.length/5/(seconds/60)),accuracy:text.length?Math.round(correct/Math.max(text.length,target.length)*100):0};}
export const variations:Record<string,{english:string;bengali:string}[]>={
'oxford-3':[{english:'I saw a bird sitting on an old tree.',bengali:'আমি একটি পুরোনো গাছে একটি পাখি বসে থাকতে দেখেছি।'},{english:'He ate an apple before taking a short walk.',bengali:'ছোট্ট হাঁটায় বেরোনোর আগে সে একটি আপেল খেয়েছে।'}],
'oxford-4':[{english:'We should never abandon children who need our help.',bengali:'আমাদের সাহায্য দরকার এমন শিশুদের কখনো পরিত্যাগ করা উচিত নয়।'},{english:'They decided to abandon the old plan and start again.',bengali:'তারা পুরোনো পরিকল্পনা ত্যাগ করে আবার শুরু করার সিদ্ধান্ত নিয়েছে।'}],
'ho-1':[{english:'Her ability to explain difficult ideas impressed the class.',bengali:'কঠিন ধারণা ব্যাখ্যা করার তার সামর্থ্য শ্রেণির সবাইকে মুগ্ধ করেছে।'},{english:'Daily practice can strengthen your ability to communicate.',bengali:'প্রতিদিনের অনুশীলন তোমার যোগাযোগের সামর্থ্য বাড়াতে পারে।'}],
'ho-2':[{english:'She is able to solve the problem without any help.',bengali:'সে কোনো সাহায্য ছাড়াই সমস্যাটি সমাধান করতে সক্ষম।'},{english:'With better transport, more people will be able to reach the hospital.',bengali:'উন্নত পরিবহনের মাধ্যমে আরও মানুষ হাসপাতালে পৌঁছাতে সক্ষম হবে।'}],
'ho-3':[{english:'The students talked about ways to save water.',bengali:'শিক্ষার্থীরা পানি বাঁচানোর উপায় সম্পর্কে কথা বলেছে।'},{english:'This book teaches us about the natural world.',bengali:'এই বই আমাদের প্রাকৃতিক জগৎ সম্পর্কে শেখায়।'}]
};
export function examplesFor(w:Word):{english:string;bengali:string;audioUrl?:string}[]{return[...(w.simple_example?[{english:w.simple_example,bengali:w.bengali_example||'',audioUrl:w.sentence_audio_url||''}]:[]),...(w.practice_examples||[]),...(variations[wordKey(w)]||[])];}
export function typingSentences(words:Word[]){const seen=new Set<string>();return words.flatMap(w=>examplesFor(w).map(e=>({...e,word:w.word,id:wordKey(w)}))).filter(e=>{if(seen.has(e.english))return false;seen.add(e.english);return true}).slice(0,40);}
