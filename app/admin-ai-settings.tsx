'use client';
import {useEffect,useState} from 'react';
export default function AdminAISettings(){
 const [status,setStatus]=useState<any>(null),[key,setKey]=useState(''),[model,setModel]=useState('gemini-2.5-flash'),[enabled,setEnabled]=useState(true),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(''),[connected,setConnected]=useState(false),[models,setModels]=useState<{id:string;name:string}[]>([]);
 useEffect(()=>{fetch('/api/admin/ai',{cache:'no-store'}).then(async r=>{const d:any=await r.json();if(!r.ok)throw Error(d.error);setStatus(d);setModel(d.model);setEnabled(d.enabled)}).catch(e=>setError(e.message))},[]);
 async function action(kind:'save'|'test',removeKey=false){
  setBusy(true);setError('');setMessage('');setConnected(false);
  const saveFirst=!removeKey&&(kind==='save'||!!key.trim()||model!==status?.model||enabled!==status?.enabled);
  try{
   const response=await fetch('/api/admin/ai',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(saveFirst?{action:'save-test',apiKey:key,model,enabled}:{action:kind,apiKey:key,model,enabled,removeKey})});
   let d:any;try{d=await response.json()}catch{throw Error(`Server returned an unreadable response (${response.status}). Your entered key is still in the field; retry.`)}
   if(d.saved||response.ok&&kind==='save'){
    setStatus(d);setKey('');setMessage(removeKey?'Saved profile key removed. A server environment key, if configured, is now used.':'API key/settings saved securely. The password field is cleared for privacy; the saved key remains on the server.');
   }
   if(!response.ok)throw Error(d.error||`Connection request failed (${response.status}).`);
   if(d.ok){setStatus((previous:any)=>({...previous,model:d.model}));setModel(d.model);setConnected(true);setMessage(d.recoveredFrom?d.message:'API key saved / available. Gemini connection and sentence assessment verified successfully.');}
   else if(d.saved&&d.error){setError('Key saved successfully, but Gemini connection verification failed: '+d.error);}
  }catch(e:any){setError(e.message||'Could not connect. Please retry.')}finally{setBusy(false)}
 }
 async function loadModels(){setBusy(true);setError('');setMessage('');try{const r=await fetch('/api/admin/ai',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'models',apiKey:key,model,enabled})});const d:any=await r.json();if(!r.ok)throw Error(d.error||'Could not load models');setModels(d.models);setStatus(d);setKey('');setMessage(d.models.length?'Choose a model from your Google project, then Save API key & connect.':'No text-generation models are available for this key. Check project access in Google AI Studio.')}catch(e:any){setError(e.message)}finally{setBusy(false)}}
 return <section className="panel settings-panel ai-settings" id="admin-ai-connection" aria-label="Administrator Gemini API connection">
  <h2>Administrator · Google AI Studio API</h2>
  <p>Connect Gemini to assess the five exam sentences and requested sentence practice. Your API key stays on the server.</p>
  <p><strong>{connected?'Connected · assessment verified':status?.configured?'API key saved · connection not yet verified in this session':'No API key saved'}</strong> · {enabled?'Enabled':'Disabled'}</p>
  {status?.updatedAt&&<p className="muted">Settings last saved: {new Date(status.updatedAt).toLocaleString()}</p>}
  <form onSubmit={e=>{e.preventDefault();void action('save')}}>
   <label>Paste Google AI Studio API key<input type="password" autoComplete="off" spellCheck={false} value={key} onChange={e=>{setKey(e.target.value);setConnected(false)}} placeholder={status?.configured?'A key is saved. Paste only to replace it.':'Paste your Google AI Studio API key'}/></label>
   <small>{status?.configured?'An empty field does not mean your key is missing. Saved keys are never displayed again.':'Paste an active Gemini API key, then select Save API key & connect.'}</small>
   <label>Gemini model ID<input list="available-gemini-models" required pattern="gemini-[a-z0-9.-]+" value={model} onChange={e=>{setModel(e.target.value);setConnected(false)}}/></label>
   <datalist id="available-gemini-models">{models.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</datalist><button className="outline" type="button" disabled={busy||!status||!key.trim()&&!status.configured} onClick={()=>void loadModels()}>Load available Google models</button>{models.length>0&&<label>Models available to this key<select value={models.some(m=>m.id===model)?model:''} onChange={e=>{setModel(e.target.value);setConnected(false)}}><option value="" disabled>Select a model</option>{models.map(m=><option key={m.id} value={m.id}>{m.name} · {m.id}</option>)}</select></label>}<p className="muted">If a model returns 404, connection testing checks up to three available alternatives and saves a replacement only after sentence assessment succeeds.</p><label className="checkbox-line"><input type="checkbox" checked={enabled} onChange={e=>{setEnabled(e.target.checked);setConnected(false)}}/>Enable AI assessment</label>
   <div className="practice-controls">
    <button className="primary" disabled={busy||!status||!key.trim()&&!status.configured} type="submit">{busy?'Connecting…':'Save API key & connect'}</button>
    <button className="outline" disabled={busy||!status||!key.trim()&&!status.configured} type="button" onClick={()=>action('test')}>Test connection</button>
    {status?.keySource==='encrypted-settings'&&<button className="outline" type="button" disabled={busy} onClick={()=>action('save',true)}>Remove saved key</button>}
   </div>
  </form>
  <div aria-live="polite">{busy&&<p>Saving and checking Gemini… This can take up to one minute.</p>}{message&&<p role="status">{message}</p>}{error&&<p role="alert" className="ai-connection-error">{error}</p>}</div>
  <small>Connection testing sends one short sample to Google. Usage is billed to your Google project. Saving and connection verification are separate results; a failed test keeps your saved key.</small>
 </section>
}
