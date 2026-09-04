import { useState, useEffect, useRef, memo } from 'react'
import { supabase } from './lib/supabase.js'
import LiveTerminal from './components/LiveTerminal.jsx'

function Logo({ size=28 }){
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className="shrink-0">
      <rect width="32" height="32" rx="8" fill="#0a0a0a"/>
      <circle cx="16" cy="16" r="9" fill="none" stroke="white" strokeWidth="1.4"/>
      <path d="M16 16 L16 7 A9 9 0 0 1 22 11" fill="none" stroke="white" strokeWidth="1.4" strokeLinecap="round"/>
      <circle cx="16" cy="16" r="1.4" fill="white"/>
    </svg>
  )
}
function sanitize(t){
  if(!t) return t
  return t.replace(/Mock:/g,'Auto-pilot:').replace(/Mock/g,'Auto-pilot')
}
function fmtTime(v){
  if(!v) return 'just now'
  let d
  if(typeof v==='number'){ d=new Date(v*1000>1e12?v:v*1000) }
  else { try{ d=new Date(v) }catch{ return 'just now' } }
  if(isNaN(d)) return 'just now'
  const hh=d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})
  const md=d.toLocaleDateString([],{month:'short',day:'numeric'})
  return `${hh} · ${md}`
}
function timeAgo(v){
  if(!v) return 'just now'
  let d
  if(typeof v==='number') d=new Date(v*1000>1e12?v:v*1000)
  else try{ d=new Date(v)}catch{ return 'just now'}
  if(isNaN(d)) return 'just now'
  const s=(Date.now()-d)/1000
  if(s<60) return 'just now'
  if(s<3600) return `${Math.floor(s/60)}m ago`
  if(s<86400) return `${Math.floor(s/3600)}h ago`
  return `${Math.floor(s/86400)}d ago`
}
function isToday(v){
  if(!v) return false
  let d= typeof v==='number' ? new Date(v*1000>1e12?v:v*1000) : new Date(v)
  if(isNaN(d)) return false
  const now=new Date()
  return d.toDateString()===now.toDateString()
}
function toMarkdown(r){
  const steps=(r.steps||[]).map(s=>`- Step ${s.step}: ${sanitize(s.thought)} → \`${s.action} ${s.target_id} ${s.value||''}\``).join('\n')
  return `# Bug Report — OmniQA
**URL:** ${r.url||''}
**Verdict:** ${r.verdict||''}
**Mode:** ${r.mode||''}
**Summary:** ${sanitize(r.summary)||''}
${r.perf?.ttfb?`**TTFB:** ${r.perf.ttfb}ms`:''} ${r.perf?.load?`· Load ${r.perf.load}ms`:''} ${r.perf?.lcp?`· LCP ${r.perf.lcp}ms`:''}
**A11y:** ${r.a11y_violations??0} violations
## Steps
${steps||'- none'}
## Console
\`\`\`
${(r.console_errors||'no errors').slice(0,2000)}
\`\`\`
Screenshot: ${r.screenshot_url||r.screenshot_b64||'none'}
---
*OmniQA — ${new Date().toISOString()}*`
}
function toCSV(reports){
  const header=['id','url','verdict','mode','summary','created_at','steps','screenshot_url']
  const rows=reports.map(r=>[r.id||r.session_id, `"${(r.url||'').replace(/"/g,'""')}"`, r.verdict, r.mode, `"${(sanitize(r.summary)||'').replace(/"/g,'""')}"`, r.created_at, r.steps?.length||0, r.screenshot_url||''].join(','))
  return [header.join(','), ...rows].join('\n')
}

function LoginScreen({ onSkip }){
  const [loading,setLoading]=useState(false)
  async function loginWithGoogle(){
    setLoading(true)
    const {error}=await supabase.auth.signInWithOAuth({provider:'google', options:{redirectTo:'http://localhost:5173'}})
    if(error) alert(error.message)
    setLoading(false)
  }
  return (
    <div className="min-h-screen bg-white flex flex-col items-center px-6 py-16">
      <div className="w-full max-w-sm flex flex-col items-center">
        <Logo />
        <h1 className="text-[24px] font-medium tracking-tight mt-6">Log into your account</h1>
        <button onClick={loginWithGoogle} disabled={loading} className="mt-8 w-full h-11 rounded-full border border-neutral-200 bg-white hover:bg-neutral-50 flex items-center justify-center gap-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black">
          <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          {loading?'Redirecting…':'Login with Google'}
        </button>
        <button onClick={onSkip} className="mt-4 text-sm underline decoration-neutral-300 underline-offset-4 hover:decoration-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black rounded">Continue as guest (demo)</button>
        <div className="mt-16 text-xs text-neutral-400">Built for Build by Sunset — HackWave 3.0</div>
      </div>
    </div>
  )
}

const StatsRow = memo(function StatsRow({ reports }){
  const active=reports.filter(r=>!r.dismissed)
  const missionsRun=reports.length
  const bugsFound=active.filter(r=>r.verdict==='BUG_FOUND').length
  const totalSteps=active.reduce((a,r)=>a+(r.steps?.length||0),0)
  const avgSteps=active.length?(totalSteps/active.length).toFixed(1):'0'
  const tokensSaved=totalSteps*1200
  return (
    <div className="border border-neutral-200 rounded-xl bg-white divide-x divide-neutral-200 flex overflow-hidden">
      <div className="flex-1 px-4 py-3"><div className="text-[11px] uppercase tracking-wide text-neutral-500">Audits</div><div className="text-[20px] font-medium leading-none mt-1">{missionsRun}</div></div>
      <div className="flex-1 px-4 py-3"><div className="text-[11px] uppercase tracking-wide text-neutral-500">Bugs found</div><div className="text-[20px] font-medium leading-none mt-1 text-red-600">{bugsFound}</div></div>
      <div className="flex-1 px-4 py-3"><div className="text-[11px] uppercase tracking-wide text-neutral-500">Tokens saved</div><div className="text-[20px] font-medium leading-none mt-1">~{tokensSaved.toLocaleString()}</div></div>
      <div className="flex-1 px-4 py-3"><div className="text-[11px] uppercase tracking-wide text-neutral-500">Avg steps</div><div className="text-[20px] font-medium leading-none mt-1">{avgSteps}</div></div>
    </div>
  )
})

function ReportView({ r, onBack, onRerun, onDismiss, githubRepo }){
  const [lightbox,setLightbox]=useState(false)
  const hasPerf = r.perf && (r.perf.ttfb!=null || r.perf.load!=null || r.perf.lcp!=null)
  useEffect(()=>{
    const h=(e)=>{ if(e.key==='Escape') onBack() }
    window.addEventListener('keydown',h)
    return ()=>window.removeEventListener('keydown',h)
  },[onBack])
  const dot = r.verdict==='BUG_FOUND'?'bg-red-600':r.verdict==='FAILED'?'bg-amber-600':r.verdict==='STOPPED'?'bg-neutral-400':'bg-emerald-600'
  const modeLabel=(r.mode==='preflight'||r.mode==='quick_check')?'Quick Check':'Full Audit'
  function handleExportMD(){ navigator.clipboard.writeText(toMarkdown(r)) }
  function handleCopyJSON(){ navigator.clipboard.writeText(JSON.stringify(r,null,2)) }
  function handleOpenGithub(){
    if(!githubRepo || !githubRepo.includes('/')){ alert('Set GitHub repo in sidebar (owner/repo) first'); return}
    const title=encodeURIComponent(`[OmniQA] ${r.verdict} — ${r.url}`)
    const body=encodeURIComponent(toMarkdown(r))
    window.open(`https://github.com/${githubRepo}/issues/new?title=${title}&body=${body}`,'_blank')
  }
  return (
    <div className="max-w-3xl mx-auto px-6 py-8 animate-[fade_150ms_ease-out]">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-neutral-600 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black rounded-md px-1 -ml-1">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg> Dashboard
      </button>
      <div className="mt-4 flex items-center gap-2 flex-wrap">
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${r.verdict==='BUG_FOUND'?'bg-red-50 border-red-200 text-red-700':r.verdict==='FAILED'?'bg-amber-50 border-amber-200 text-amber-700':r.verdict==='STOPPED'?'bg-neutral-100 border-neutral-200 text-neutral-600':'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />{r.verdict}
        </span>
        <span className="text-xs px-2 py-1 rounded-full border border-neutral-200 bg-white">{modeLabel}</span>
        <span className="text-xs text-neutral-500">{fmtTime(r.created_at)}</span>
        <a href={r.url} target="_blank" rel="noreferrer" className="text-xs text-neutral-600 hover:underline inline-flex items-center gap-1">{r.url?.slice(0,40)} <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14L21 3"/></svg></a>
      </div>
      <h1 className="text-[18px] font-medium mt-3 leading-snug">{sanitize(r.summary)||'—'}</h1>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {hasPerf && (
          <>
            {r.perf.ttfb!=null && <span className="text-xs px-2 py-1 rounded-full bg-neutral-100 border border-neutral-200">TTFB {r.perf.ttfb}ms</span>}
            {r.perf.load!=null && <span className="text-xs px-2 py-1 rounded-full bg-neutral-100 border border-neutral-200">Load {r.perf.load}ms</span>}
            {r.perf.lcp!=null && <span className="text-xs px-2 py-1 rounded-full bg-neutral-100 border border-neutral-200">LCP {r.perf.lcp}ms</span>}
          </>
        )}
        <span className={`text-xs px-2 py-1 rounded-full border ${ (r.a11y_violations||0)>0 ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>A11y: {r.a11y_violations??0} violations</span>
        <span className="text-xs px-2 py-1 rounded-full bg-white border border-neutral-200">Steps {r.steps?.length||0}</span>
      </div>
      {r.warnings?.length>0 && <div className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5">{r.warnings.length} third-party warnings ignored: {r.warnings.slice(0,2).join(' | ').slice(0,160)}</div>}
      {(r.screenshot_b64||r.screenshot_url) && (
        <div className="mt-6 border border-neutral-200 rounded-lg overflow-hidden bg-white cursor-pointer" onClick={()=>setLightbox(true)}>
          <img src={r.screenshot_b64||r.screenshot_url} alt="evidence" className="w-full" />
        </div>
      )}
      {lightbox && <div onClick={()=>setLightbox(false)} className="fixed inset-0 bg-black/70 flex items-center justify-center p-6 z-50"><img src={r.screenshot_b64||r.screenshot_url} alt="evidence" className="max-w-[90vw] max-h-[90vh] rounded-lg" onClick={e=>e.stopPropagation()} /><button onClick={()=>setLightbox(false)} className="absolute top-4 right-4 bg-white rounded-full w-8 h-8 flex items-center justify-center">✕</button></div>}
      <div className="mt-6">
        <div className="text-xs font-medium mb-2">Steps</div>
        <div className="border border-neutral-200 rounded-lg divide-y divide-neutral-200 overflow-hidden">
          {(r.steps||[]).map(s=>(
            <div key={s.step} className="flex gap-3 px-3 py-2.5 bg-white">
              <span className="text-xs font-mono text-neutral-400 w-5">{s.step}</span>
              <span className="flex-1 text-xs text-neutral-800 whitespace-pre-wrap break-words">{sanitize(s.thought)?.slice(0,300)}</span>
              <span className={`text-[11px] px-1.5 py-0.5 rounded font-mono h-fit shrink-0 ${s.action==='click'?'bg-cyan-50 text-cyan-700 border border-cyan-200':s.action==='type'?'bg-cyan-50 text-cyan-700 border border-cyan-200':s.action==='finish'?'bg-neutral-100 text-neutral-600 border border-neutral-200':'bg-red-50 text-red-700 border border-red-200'}`}>{s.action}</span>
            </div>
          ))}
        </div>
      </div>
      {r.console_errors && <pre className="mt-4 bg-[#0b0d10] text-neutral-300 rounded-lg p-4 text-[12px] leading-5 whitespace-pre-wrap break-words overflow-x-auto max-h-64 overflow-auto">{sanitize(r.console_errors).slice(0,3000)}</pre>}
      {r.a11y_details && <div className="mt-3 text-xs text-neutral-600 border border-neutral-200 rounded-lg p-3 bg-neutral-50 whitespace-pre-wrap break-words">{sanitize(r.a11y_details)}</div>}
      <div className="sticky bottom-0 mt-6 -mx-6 px-6 py-3 bg-white/80 backdrop-blur border-t border-neutral-200 flex flex-wrap gap-2">
        <button onClick={()=>onRerun(r)} className="h-9 px-4 bg-[#0a0a0a] hover:bg-[#262626] text-white rounded-lg text-xs font-medium flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black">Re-run</button>
        <button onClick={handleExportMD} className="h-9 px-3 border border-neutral-200 rounded-lg text-xs hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black">Export MD</button>
        <button onClick={handleCopyJSON} className="h-9 px-3 border border-neutral-200 rounded-lg text-xs hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black">Copy JSON</button>
        {githubRepo && <button onClick={handleOpenGithub} className="h-9 px-3 border border-neutral-200 rounded-lg text-xs hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black">Open GitHub</button>}
        <button onClick={()=>onDismiss(r)} className="h-9 px-3 border border-neutral-200 rounded-lg text-xs text-neutral-600 hover:bg-neutral-50 ml-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black">Dismiss</button>
      </div>
      <style>{`@keyframes fade{from{opacity:0}to{opacity:1}}`}</style>
    </div>
  )
}

export default function App(){
  const [url,setUrl]=useState('https://www.saucedemo.com')
  const [bug,setBug]=useState('Test login flow — try standard_user / secret_sauce, check for errors')
  const [mode,setMode]=useState('bug_hunter')
  const [logs,setLogs]=useState([])
  const [reports,setReports]=useState([])
  const [running,setRunning]=useState(false)
  const [runningId,setRunningId]=useState(null)
  const [session,setSession]=useState(null)
  const [authLoading,setAuthLoading]=useState(true)
  const [guestMode,setGuestMode]=useState(false)
  const [esRef,setEsRef]=useState(null)
  const [aiStatus,setAiStatus]=useState({live:false, model:null, checked:false})
  const [filter,setFilter]=useState('All')
  const [search,setSearch]=useState('')
  const [selectedId,setSelectedId]=useState(null)
  const [githubRepo,setGithubRepo]=useState(()=>localStorage.getItem('github_repo')||'')
  const [reRunToast,setReRunToast]=useState(false)
  const [exportToast,setExportToast]=useState(false)
  const [elapsed,setElapsed]=useState(0)
  const [sidebarOpen,setSidebarOpen]=useState(()=>{ try{ return JSON.parse(localStorage.getItem('sidebarOpen')??'true')}catch{return true}})
  const timerRef=useRef(null)

  useEffect(()=>{
    supabase.auth.getSession().then(({data})=>{setSession(data.session); setAuthLoading(false)})
    const {data:sub}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s))
    return ()=>sub.subscription.unsubscribe()
  },[])
  useEffect(()=>{ fetchReports() },[])
  useEffect(()=>{ fetch('http://localhost:8000/api/ai-status').then(r=>r.json()).then(setAiStatus).catch(()=>{}) },[])
  useEffect(()=>{ localStorage.setItem('github_repo', githubRepo) },[githubRepo])
  useEffect(()=>{ localStorage.setItem('sidebarOpen', JSON.stringify(sidebarOpen)) },[sidebarOpen])
  useEffect(()=>{
    if(running){ const t0=Date.now(); timerRef.current=setInterval(()=>setElapsed(Math.floor((Date.now()-t0)/1000)),1000)} else { clearInterval(timerRef.current); setElapsed(0)}
    return ()=>clearInterval(timerRef.current)
  },[running])

  async function fetchReports(){
    try{ const r=await fetch('http://localhost:8000/api/reports'); const j=await r.json(); setReports(Array.isArray(j)?j:[])}catch{}
  }

  async function startAudit(prefill){
    const _url=prefill?.url||url
    const _bug=prefill?.bug_description??bug
    const _mode=prefill?.mode||mode
    if(prefill){ setUrl(_url); setBug(_bug); setMode(_mode); setSelectedId(null); window.scrollTo({top:0, behavior:'smooth'}) }
    let apiMode=_mode
    if(apiMode==='full_audit') apiMode='bug_hunter'
    if(apiMode==='quick_check') apiMode='preflight'
    setRunning(true); setLogs([]); setSelectedId(null)
    try{
      const res=await fetch('http://localhost:8000/api/mission',{method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({url:_url, bug_description:_bug, mode: apiMode})})
      if(!res.ok) throw new Error(await res.text())
      const {mission_id}=await res.json()
      setRunningId(mission_id)
      setLogs(l=>[...l,{type:'info', msg:`Audit ${mission_id} started (${_mode})`, ts:new Date().toLocaleTimeString()}])
      const es=new EventSource(`http://localhost:8000/api/stream/${mission_id}`)
      setEsRef(es)
      es.addEventListener('log', e=>{ try{ const d=JSON.parse(e.data); setLogs(l=>[...l,{...d, msg: sanitize(d.msg)}])}catch{}})
      es.addEventListener('done', async ()=>{ es.close(); setEsRef(null); setRunning(false); setRunningId(null); try{ fetchReports() }catch{} })
      es.onerror=()=>{ es.close(); setEsRef(null); setRunning(false); setRunningId(null); setLogs(l=>[...l,{type:'error', msg:'Stream error — is backend running on :8000?'}])}
    }catch(e){ setLogs(l=>[...l,{type:'error', msg:String(e)}]); setRunning(false); setRunningId(null)}
  }
  async function handleStop(){
    const id=runningId
    setRunning(false)
    if(esRef){ esRef.close(); setEsRef(null) }
    setLogs(l=>[...l,{type:'info', msg:'Audit stopped by user.'}])
    if(id){
      try{ await fetch(`http://localhost:8000/api/stop/${id}`,{method:'POST'}) }catch{}
      try{ await fetch('http://localhost:8000/api/stop',{method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({mission_id:id})}) }catch{}
    }
  }
  function handleRerun(r){
    setReRunToast(true); setTimeout(()=>setReRunToast(false),2000)
    startAudit({url:r.url, bug_description:r.bug_description||'', mode:r.mode||'bug_hunter'})
  }
  function handleDismiss(r){
    const id=r.id||r.session_id
    setReports(prev=>prev.map(x=> (x.id||x.session_id)===id ? {...x, dismissed:true} : x))
    fetch(`http://localhost:8000/api/reports/${id}/dismiss`,{method:'POST'}).catch(()=>{})
    const d=JSON.parse(localStorage.getItem('dismissed')||'[]'); d.push(id); localStorage.setItem('dismissed', JSON.stringify(d))
    setSelectedId(null)
  }
  function handleExportCSV(){
    const header=['id','url','verdict','mode','summary','created_at','steps','screenshot_url']
    const rows=reports.filter(r=>!r.dismissed).map(r=>[r.id||r.session_id, `"${(r.url||'').replace(/"/g,'""')}"`, r.verdict, r.mode, `"${(sanitize(r.summary)||'').replace(/"/g,'""')}"`, r.created_at, r.steps?.length||0, r.screenshot_url||''].join(','))
    const csv=[header.join(','), ...rows].join('\n')
    navigator.clipboard.writeText(csv); setExportToast(true); setTimeout(()=>setExportToast(false),2000)
  }

  if(authLoading) return <div className="min-h-screen bg-white flex items-center justify-center text-neutral-500 text-sm">Loading…</div>
  const authed=!!session||guestMode
  if(!authed) return <LoginScreen onSkip={()=>setGuestMode(true)} />

  const filtered=reports.filter(r=>{
    if(filter!=='All' && r.verdict!==filter) return false
    if(r.dismissed && filter==='BUG_FOUND') return false
    if(search){
      const q=search.toLowerCase()
      if(!((r.url||'').toLowerCase().includes(q) || (r.bug_description||'').toLowerCase().includes(q) || (r.summary||'').toLowerCase().includes(q))) return false
    }
    return true
  })
  const todayList=filtered.filter(r=>isToday(r.created_at) && !r.dismissed)
  const earlierList=filtered.filter(r=>!isToday(r.created_at) && !r.dismissed)
  const selected = selectedId ? reports.find(r=> (r.id||r.session_id)===selectedId) : null
  const showReport = !!selected

  return (
    <div className="min-h-screen bg-white text-neutral-900 flex">
      {/* Sidebar */}
      <aside className={`bg-neutral-50 border-r border-neutral-200 flex flex-col shrink-0 transition-transform duration-200 ease-[ease] ${sidebarOpen?'w-[264px] translate-x-0':'w-[264px] -translate-x-full lg:w-0 lg:border-0 lg:overflow-hidden'} max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:z-20 max-lg:shadow-xl ${!sidebarOpen?'max-lg:hidden':''}`}>
        <div className="p-3 border-b border-neutral-200">
          <button onClick={()=>{ setSelectedId(null); setUrl('https://www.saucedemo.com'); setBug(''); setMode('bug_hunter'); setLogs([])}} className="w-full h-9 bg-[#0a0a0a] hover:bg-[#262626] text-white rounded-lg text-sm font-medium flex items-center justify-center gap-1.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black">+ New Audit</button>
          <div className="mt-3 flex gap-1.5">
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Filter by URL…" className="flex-1 h-8 rounded-md border border-neutral-200 bg-white px-2.5 text-xs placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-black/5" />
            <button onClick={handleExportCSV} aria-label="Download CSV" className="h-8 w-8 rounded-md border border-neutral-200 bg-white hover:bg-neutral-50 flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 12.8V3"/></svg>
            </button>
          </div>
          <div className="mt-2 inline-flex rounded-md border border-neutral-200 overflow-hidden w-full">
            {['All','BUG_FOUND','CLEAN','FAILED'].map(k=>(
              <button key={k} onClick={()=>setFilter(k)} className={`flex-1 py-1 text-[11px] ${filter===k?'bg-neutral-900 text-white':'bg-white text-neutral-600 hover:bg-neutral-50'} transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-black`}>{k==='BUG_FOUND'?'Bugs':k==='CLEAN'?'Clean':k==='FAILED'?'Failed':'All'}</button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-auto px-2 py-3 space-y-4">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-neutral-500 px-2 mb-1">Today</div>
            {todayList.length===0 ? <div className="text-xs text-neutral-400 px-2 py-2">No audits today</div> : todayList.slice(0,20).map(r=>{
              const id=r.id||r.session_id
              const active=selectedId===id
              const dot=r.verdict==='BUG_FOUND'?'bg-red-600':r.verdict==='FAILED'?'bg-amber-600':r.verdict==='STOPPED'?'bg-neutral-400':'bg-emerald-600'
              return (
                <button key={id} onClick={()=>{ setSelectedId(id); if(window.innerWidth<768) setSidebarOpen(false)}} className={`w-full text-left flex items-center gap-2 px-2.5 py-2 rounded-md border text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black ${active?'bg-white border-neutral-200 shadow-sm':'border-transparent hover:bg-white hover:border-neutral-200'}`}>
                  <span className={`w-2 h-2 rounded-full ${dot} shrink-0`} />
                  <span className="flex-1 min-w-0"><span className="truncate block text-neutral-800">{r.url||'—'}</span><span className="text-[11px] text-neutral-500">{timeAgo(r.created_at)}</span></span>
                </button>
              )
            })}
          </div>
          {earlierList.length>0 && (
            <div>
              <div className="text-[11px] uppercase tracking-wide text-neutral-500 px-2 mb-1">Earlier</div>
              {earlierList.slice(0,30).map(r=>{
                const id=r.id||r.session_id
                const active=selectedId===id
                const dot=r.verdict==='BUG_FOUND'?'bg-red-600':r.verdict==='FAILED'?'bg-amber-600':r.verdict==='STOPPED'?'bg-neutral-400':'bg-emerald-600'
                return (
                  <button key={id} onClick={()=>{ setSelectedId(id); if(window.innerWidth<768) setSidebarOpen(false)}} className={`w-full text-left flex items-center gap-2 px-2.5 py-2 rounded-md border text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black ${active?'bg-white border-neutral-200 shadow-sm':'border-transparent hover:bg-white hover:border-neutral-200'}`}>
                    <span className={`w-2 h-2 rounded-full ${dot} shrink-0`} />
                    <span className="flex-1 min-w-0"><span className="truncate block text-neutral-800">{r.url||'—'}</span><span className="text-[11px] text-neutral-500">{fmtTime(r.created_at)}</span></span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
        <div className="p-3 border-t border-neutral-200 space-y-2">
          <input value={githubRepo} onChange={e=>setGithubRepo(e.target.value)} placeholder="owner/repo (GitHub)" className="w-full h-8 rounded-md border border-neutral-200 bg-white px-2.5 text-xs placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-black/5" />
          <div className="flex items-center justify-between">
            <span className="text-xs text-neutral-500 truncate max-w-[110px]">{session?.user.email||'Guest'}</span>
            {session ? <button onClick={()=>supabase.auth.signOut()} className="text-xs px-2 py-1 rounded-md hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black">Sign out</button> : <button onClick={()=>setGuestMode(false)} className="text-xs px-2 py-1 rounded-md border border-neutral-200">Sign in</button>}
          </div>
        </div>
      </aside>
      {sidebarOpen && <div onClick={()=>setSidebarOpen(false)} className="fixed inset-0 bg-black/20 z-10 lg:hidden" />}

      {/* Main canvas */}
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="h-14 border-b border-neutral-200 flex items-center px-6 shrink-0 sticky top-0 bg-white z-10">
          <button onClick={()=>setSidebarOpen(!sidebarOpen)} aria-label="Toggle sidebar" className="mr-3 p-1.5 rounded-md hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/></svg>
          </button>
          <div className="flex items-center gap-2.5"><Logo size={26} /><span className="font-medium tracking-tight">OmniQA</span><span className="text-xs text-neutral-500 hidden sm:inline">Autonomous Web QA</span></div>
          <div className="ml-auto flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-xs text-neutral-600">
              <span className={`w-1.5 h-1.5 rounded-full ${aiStatus.live?'bg-emerald-600':'bg-neutral-300'}`} />{aiStatus.live?'AI live':'Auto-pilot'}
            </span>
          </div>
        </div>

        {showReport && selected ? (
          <ReportView r={selected} onBack={()=>setSelectedId(null)} onRerun={(r)=>{ setSelectedId(null); handleRerun(r)}} onDismiss={handleDismiss} githubRepo={githubRepo} />
        ) : (
          <div className="max-w-5xl mx-auto w-full px-6 py-8 space-y-6 flex-1">
            <div className="grid gap-6 items-stretch" style={{gridTemplateColumns:'380px 1fr'}}>
              <div className="bg-white border border-neutral-200 rounded-xl p-5 flex flex-col">
                <h2 className="text-sm font-medium">New Audit</h2>
                <div className="mt-4 space-y-3 flex-1">
                  <div><label className="text-[11px] uppercase tracking-wide text-neutral-500">Target URL</label><input value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://example.com" className="mt-1 w-full h-10 rounded-md border border-neutral-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-black/5" /></div>
                  <div><label className="text-[11px] uppercase tracking-wide text-neutral-500">Issue description (optional)</label><textarea value={bug} onChange={e=>setBug(e.target.value)} rows={3} placeholder="Describe what to test…" className="mt-1 w-full rounded-md border border-neutral-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-black/5 resize-none" /></div>
                  <div><label className="text-[11px] uppercase tracking-wide text-neutral-500">Mode</label>
                    <select value={mode} onChange={e=>setMode(e.target.value)} className="mt-1 w-full h-10 rounded-md border border-neutral-200 px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-black/5">
                      <option value="bug_hunter">Full Audit</option>
                      <option value="preflight">Quick Check</option>
                    </select>
                  </div>
                </div>
                <div className="mt-4">
                  {!running ? <button onClick={()=>startAudit()} className="w-full h-10 bg-[#0a0a0a] hover:bg-[#262626] text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black">Start Audit</button>
                  : <button onClick={handleStop} className="w-full h-10 bg-white border border-red-200 text-red-600 hover:bg-red-50 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="18" height="18" rx="2"/></svg> Stop Audit</button>}
                </div>
              </div>
              <div className="flex flex-col">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium flex items-center gap-1.5">Live Activity {running && <span className="inline-flex items-center justify-center w-4 h-4 rounded bg-red-50 border border-red-200"><svg width="8" height="8" viewBox="0 0 24 24" fill="#dc2626"><rect x="3" y="3" width="18" height="18" rx="2"/></svg></span>}</h3>
                  <span className="text-xs text-neutral-500 tabular-nums">{running?`${elapsed}s elapsed`:'idle'}</span>
                </div>
                <div className="flex-1 min-h-[440px] max-h-[560px] flex flex-col"><div className="flex-1"><LiveTerminal logs={logs} /></div></div>
                {!running && logs.length===0 && <div className="text-xs text-neutral-500 mt-2">Start an audit to see live reasoning</div>}
              </div>
            </div>
            <StatsRow reports={reports} />
            {running && selected && (
              <button onClick={()=>setSelectedId(null)} className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-neutral-900 text-white px-4 py-2 rounded-full text-xs shadow-lg flex items-center gap-2">Audit running — View live</button>
            )}
            <div className="text-xs text-neutral-400 text-center pt-2">No Docker · No LangChain · Featherless only</div>
          </div>
        )}
      </div>

      {reRunToast && <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-neutral-900 text-white px-3 py-2 rounded-full text-xs shadow-lg">Re-running audit…</div>}
      {exportToast && <div className="fixed bottom-4 right-4 bg-neutral-900 text-white px-3 py-2 rounded-lg text-xs shadow-lg">Copied — paste into GitHub</div>}
    </div>
  )
}
