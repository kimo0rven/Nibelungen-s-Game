import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

const isField = (el) => el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement

// Client-side deterrents for the player screen. These can be bypassed by a determined user,
// so every trigger is also reported to the server for the host to see.
export function useAntiCheat(quizId, active) {
  const [warning, setWarning] = useState(null)
  const lastReport = useRef({})

  useEffect(() => {
    if (!active) return

    const report = (kind, message) => {
      setWarning(message)
      const now = Date.now()
      if (now - (lastReport.current[kind] ?? 0) < 3000) return
      lastReport.current[kind] = now
      supabase.rpc('report_violation', { p_quiz: quizId, p_kind: kind })
    }

    const block = (e) => e.preventDefault()
    const onSelect = (e) => {
      if (!isField(e.target)) e.preventDefault()
    }
    const onCopyCut = (e) => {
      if (!isField(e.target)) e.preventDefault()
    }
    const onPaste = (e) => {
      e.preventDefault()
      report('paste', 'Pasting is disabled.')
    }
    const onKey = (e) => {
      const k = e.key.toLowerCase()
      const mod = e.ctrlKey || e.metaKey
      const devtools = k === 'f12' || (mod && e.shiftKey && ['i', 'j', 'c'].includes(k)) || (e.metaKey && e.altKey && ['i', 'j', 'c'].includes(k))
      const blocked = devtools || (mod && ['u', 's', 'p', 'a', 'f'].includes(k)) || (mod && ['c', 'x'].includes(k) && !isField(e.target))
      if (blocked) {
        e.preventDefault()
        report('shortcut', 'That shortcut is disabled during the quiz.')
      }
      if (k === 'printscreen') {
        navigator.clipboard?.writeText('').catch(() => {})
        report('shortcut', 'Screenshots are discouraged during the quiz.')
      }
    }
    const onVisibility = () => {
      if (document.hidden) report('tab_hidden', 'You left the quiz tab. This was reported to the host.')
    }
    const onBlur = () => {
      if (!document.hidden) report('window_blur', 'The quiz window lost focus. This was reported to the host.')
    }

    // Docked DevTools shrink the viewport relative to the outer window.
    let devtoolsOpen = false
    const checkDevtools = () => {
      const open = window.outerWidth - window.innerWidth > 200 || window.outerHeight - window.innerHeight > 260
      if (open && !devtoolsOpen) report('devtools', 'Developer tools detected. This was reported to the host.')
      devtoolsOpen = open
    }
    const timer = setInterval(checkDevtools, 2000)

    document.addEventListener('contextmenu', block)
    document.addEventListener('dragstart', block)
    document.addEventListener('selectstart', onSelect)
    document.addEventListener('copy', onCopyCut)
    document.addEventListener('cut', onCopyCut)
    document.addEventListener('paste', onPaste)
    document.addEventListener('keydown', onKey)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('blur', onBlur)

    return () => {
      clearInterval(timer)
      document.removeEventListener('contextmenu', block)
      document.removeEventListener('dragstart', block)
      document.removeEventListener('selectstart', onSelect)
      document.removeEventListener('copy', onCopyCut)
      document.removeEventListener('cut', onCopyCut)
      document.removeEventListener('paste', onPaste)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('blur', onBlur)
    }
  }, [quizId, active])

  return { warning, dismiss: () => setWarning(null) }
}
