import { useEffect, useRef, useState, memo } from 'react'

function LiveTerminalInner({ logs }) {
  const ref = useRef(null)
  const bufRef = useRef([])
  const [renderLogs, setRenderLogs] = useState([])
  const nearBottomRef = useRef(true)

  // buffer flush every 200ms, cap 250
  useEffect(() => {
    bufRef.current.push(...logs.slice(renderLogs.length))
    // if logs is replacement (cleared), reset
    if (logs.length === 0) {
      bufRef.current = []
      setRenderLogs([])
      return
    }
    if (logs.length < renderLogs.length) {
      bufRef.current = [...logs]
      setRenderLogs([...logs].slice(-250))
      return
    }
  }, [logs])

  useEffect(() => {
    const id = setInterval(() => {
      if (bufRef.current.length === 0) return
      // auto-scroll check: only if near bottom
      const el = ref.current
      if (el) {
        nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
      }
      setRenderLogs(prev => {
        const combined = [...prev, ...bufRef.current]
        bufRef.current = []
        const capped = combined.slice(-250)
        return capped
      })
    }, 200)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (nearBottomRef.current && ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight
    }
  }, [renderLogs])

  function colorFor(type) {
    if (type === 'thought') return 'text-neutral-400'
    if (type === 'action' || type === 'act_result') return 'text-cyan-400'
    if (type === 'error') return 'text-red-400'
    if (type === 'observe' || type === 'info') return 'text-emerald-300'
    if (type === 'think') return 'text-neutral-500 italic'
    if (type === 'dom') return 'text-zinc-500 truncate'
    return 'text-neutral-300'
  }

  return (
    <div ref={ref} className="bg-[#0b0d10] rounded-xl border border-neutral-800 p-4 h-full min-h-[440px] max-h-[560px] overflow-auto overflow-x-auto font-mono text-[12px] leading-5">
      {renderLogs.length === 0 && <div className="text-neutral-500 flex items-center gap-2">Awaiting audit… <span className="w-2 h-4 bg-neutral-600 animate-pulse inline-block" /></div>}
      {renderLogs.map((l, i) => (
        <div key={i} className={`${colorFor(l.type)} whitespace-pre-wrap break-words`}>
          <span className="text-neutral-600">[{l.ts || '--:--:--'}]</span> <span className="uppercase tracking-wide text-[10px] opacity-60">{l.type}:</span> {l.msg?.slice(0, 600)}
        </div>
      ))}
      {renderLogs.length > 0 && <div className="text-neutral-700 mt-2">▌</div>}
    </div>
  )
}

export default memo(LiveTerminalInner)
