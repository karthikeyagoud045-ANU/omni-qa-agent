import { useState, memo } from 'react'
import { RotateCw, Copy, Image as ImageIcon, ChevronDown, Check } from 'lucide-react'

function fmtTime(v) {
  if (!v) return '—'
  // v can be seconds (float) or ISO string
  let d
  if (typeof v === 'number') d = new Date(v * 1000 > 1e12 ? v : v * 1000)
  else d = new Date(v)
  if (isNaN(d)) return String(v).slice(0,16)
  const hh = d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})
  const md = d.toLocaleDateString([], {month:'short', day:'numeric'})
  return `${hh} · ${md}`
}
function timeAgo(v){
  if(!v) return ''
  let d = typeof v==='number' ? new Date(v*1000>1e12?v:v*1000) : new Date(v)
  if(isNaN(d)) return ''
  const s = (Date.now()-d)/1000
  if(s<60) return 'just now'
  if(s<3600) return `${Math.floor(s/60)}m ago`
  if(s<86400) return `${Math.floor(s/3600)}h ago`
  return `${Math.floor(s/86400)}d ago`
}

function toMarkdown(r){
  const steps=(r.steps||[]).map(s=>`- Step ${s.step}: ${s.thought} → \`${s.action} ${s.target_id} ${s.value||''}\``).join('\n')
  return `# Bug Report — OmniQA
**URL:** ${r.url||''}
**Verdict:** ${r.verdict||''}
**Mode:** ${r.mode||''}
**Summary:** ${r.summary||''}

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

const Row = memo(function Row({ r, onRerun, onExport, onLightbox, expanded, onToggle }){
  const v=r.verdict
  const dot = v==='BUG_FOUND'?'bg-red-600':v==='FAILED'?'bg-amber-600':'bg-emerald-600'
  const label = v==='BUG_FOUND'?'Bug':v==='FAILED'?'Failed':'Clean'
  const modeLabel = (r.mode==='preflight'||r.mode==='quick_check')?'Quick Check':'Full Audit'
  const hasShot = !!(r.screenshot_url || r.screenshot_b64)
  return (
    <>
      <tr onClick={onToggle} className="hover:bg-neutral-50 cursor-pointer border-b border-neutral-200">
        <td className="py-2.5 px-3 whitespace-nowrap"><span className="inline-flex items-center gap-1.5 text-xs"><span className={`w-2 h-2 rounded-full ${dot}`} />{label}</span></td>
        <td className="py-2.5 px-3 text-xs max-w-[160px] truncate text-neutral-700" title={r.url}>{r.url||'—'}</td>
        <td className="py-2.5 px-3 text-xs max-w-[220px] truncate text-neutral-500" title={r.summary}>{r.summary||'—'}</td>
        <td className="py-2.5 px-3 whitespace-nowrap"><span className="text-[11px] px-2 py-0.5 rounded-full border border-neutral-200 bg-white text-neutral-600">{modeLabel}</span></td>
        <td className="py-2.5 px-3 whitespace-nowrap text-xs text-neutral-500" title={fmtTime(r.created_at)}>{fmtTime(r.created_at)}</td>
        <td className="py-2.5 px-3 whitespace-nowrap">
          <span className="inline-flex gap-1">
            <button onClick={(e)=>{e.stopPropagation(); onRerun(r)}} className="p-1.5 rounded-md border border-neutral-200 hover:bg-white hover:border-neutral-300" title="Re-run"><RotateCw size={14} /></button>
            <button onClick={(e)=>{e.stopPropagation(); onExport(r)}} className="p-1.5 rounded-md border border-neutral-200 hover:bg-white hover:border-neutral-300" title="Export"><Copy size={14} /></button>
            {hasShot && <button onClick={(e)=>{e.stopPropagation(); onLightbox(r)}} className="p-1.5 rounded-md border border-neutral-200 hover:bg-white hover:border-neutral-300" title="Screenshot"><ImageIcon size={14} /></button>}
          </span>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-neutral-50 border-b border-neutral-200">
          <td colSpan={6} className="px-4 py-3 text-xs">
            <div className="grid gap-2">
              <div className="font-mono text-[12px] leading-5">
                <div className="font-medium text-neutral-700 mb-1">Steps ({r.steps?.length||0})</div>
                {(r.steps||[]).slice(0,10).map(s=>(
                  <div key={s.step} className="flex gap-2 text-neutral-600"><span className="font-mono text-neutral-400">{s.step}.</span><span className="flex-1">{s.thought?.slice(0,120)}</span><span className="text-cyan-600 font-mono">{s.action}</span></div>
                ))}
              </div>
              {r.console_errors && <pre className="bg-white border border-neutral-200 rounded-md p-2.5 text-[11px] whitespace-pre-wrap break-words text-neutral-600 max-h-24 overflow-auto">{r.console_errors.slice(0,1000)}</pre>}
              {hasShot && <a href={r.screenshot_b64||r.screenshot_url} target="_blank" rel="noreferrer" className="text-xs underline text-neutral-600">Open screenshot</a>}
            </div>
          </td>
        </tr>
      )}
    </>
  )
})

export default function HistoryTable({ reports, onRerun, filter, search }){
  const [expanded, setExpanded] = useState(null)
  const [toast, setToast] = useState(false)
  const [lightbox, setLightbox] = useState(null)

  const filtered = reports.filter(r=>{
    if(filter!=='All' && r.verdict!==filter) return false
    if(search){
      const q=search.toLowerCase()
      if(!( (r.url||'').toLowerCase().includes(q) || (r.bug_description||'').toLowerCase().includes(q) || (r.summary||'').toLowerCase().includes(q) )) return false
    }
    return true
  })

  function handleExport(r){
    const md=toMarkdown(r)
    navigator.clipboard.writeText(md)
    setToast(true); setTimeout(()=>setToast(false),2000)
  }

  if(reports.length===0) return <div className="text-sm text-neutral-500 border border-dashed border-neutral-200 rounded-lg p-8 text-center bg-white">No audits yet — run your first audit to see history</div>

  return (
    <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 border-b border-neutral-200 text-[11px] uppercase tracking-wide text-neutral-500">
            <tr><th className="text-left font-medium py-2 px-3">Status</th><th className="text-left font-medium py-2 px-3">Target</th><th className="text-left font-medium py-2 px-3">Summary</th><th className="text-left font-medium py-2 px-3">Mode</th><th className="text-left font-medium py-2 px-3">Time</th><th className="text-left font-medium py-2 px-3">Actions</th></tr>
          </thead>
          <tbody>
            {filtered.length===0 ? <tr><td colSpan={6} className="py-8 text-center text-neutral-500 text-sm">No matches</td></tr> : filtered.slice(0,50).map(r=>(
              <Row key={r.id||r.session_id} r={r} onRerun={onRerun} onExport={handleExport} onLightbox={setLightbox} expanded={expanded===(r.id||r.session_id)} onToggle={()=>setExpanded(expanded===(r.id||r.session_id)?null:(r.id||r.session_id))} />
            ))}
          </tbody>
        </table>
      </div>
      {toast && <div className="fixed bottom-4 right-4 bg-neutral-900 text-white px-3 py-2 rounded-lg text-xs flex items-center gap-1.5 shadow-lg"><Check size={14}/> Copied — paste into GitHub</div>}
      {lightbox && (
        <div onClick={()=>setLightbox(null)} className="fixed inset-0 bg-black/70 flex items-center justify-center p-6 z-50">
          <img onClick={e=>e.stopPropagation()} src={lightbox.screenshot_b64||lightbox.screenshot_url} alt="evidence" className="max-w-[90vw] max-h-[90vh] rounded-lg border border-white/20" />
          <button onClick={()=>setLightbox(null)} className="absolute top-4 right-4 bg-white rounded-full p-2">✕</button>
        </div>
      )}
    </div>
  )
}

// helper for Recent list
export function RecentMissions({ reports, onRerun }){
  const last5 = reports.slice(0,5)
  if(last5.length===0) return <div className="text-xs text-neutral-500 py-2">No recent audits</div>
  return (
    <div className="divide-y divide-neutral-200">
      {last5.map(r=>{
        const dot = r.verdict==='BUG_FOUND'?'bg-red-600':r.verdict==='FAILED'?'bg-amber-600':'bg-emerald-600'
        return (
          <button key={r.id||r.session_id} onClick={()=>onRerun(r)} className="w-full text-left flex items-center gap-2 py-2.5 hover:bg-neutral-50 px-1 -mx-1 rounded-md">
            <span className={`w-2 h-2 rounded-full ${dot} shrink-0`} />
            <span className="flex-1 min-w-0"><span className="text-xs truncate block text-neutral-700">{r.url||'—'}</span><span className="text-[11px] text-neutral-500">{timeAgo(r.created_at)}</span></span>
            <span className="text-[11px] text-neutral-500">{r.verdict==='BUG_FOUND'?'Bug':r.verdict==='FAILED'?'Fail':'Clean'}</span>
          </button>
        )
      })}
    </div>
  )
}
