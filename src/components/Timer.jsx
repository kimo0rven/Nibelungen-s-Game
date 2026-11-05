import { useEffect, useRef, useState } from 'react'
import { sfx } from '../lib/sound'

export default function Timer({ startedAt, limit, offset, running, onExpire, pausedAt = null }) {
  const now = () => (pausedAt ? new Date(pausedAt).getTime() : Date.now() + offset)
  const compute = () => limit - (now() - new Date(startedAt).getTime()) / 1000
  const [left, setLeft] = useState(compute)
  const fired = useRef(false)
  const lastWhole = useRef(null)
  const expireRef = useRef(onExpire)

  useEffect(() => {
    expireRef.current = onExpire
  })

  useEffect(() => {
    fired.current = false
    lastWhole.current = null
    if (!running) return
    if (pausedAt) {
      setLeft(limit - (new Date(pausedAt).getTime() - new Date(startedAt).getTime()) / 1000)
      return
    }
    const id = setInterval(() => {
      const l = limit - (Date.now() + offset - new Date(startedAt).getTime()) / 1000
      setLeft(l)
      const whole = Math.ceil(l)
      if (whole !== lastWhole.current && whole <= 5 && whole > 0) sfx.tick()
      lastWhole.current = whole
      if (l <= 0 && !fired.current) {
        fired.current = true
        expireRef.current?.()
      }
    }, 100)
    return () => clearInterval(id)
  }, [startedAt, limit, offset, running, pausedAt])

  const pct = Math.max(0, Math.min(100, (left / limit) * 100))
  const danger = left <= 5
  return (
    <div className={`timer ${danger && running ? 'danger' : ''}`}>
      <div className="timer-bar">
        <div className="timer-fill" style={{ width: `${running ? pct : 0}%` }} />
      </div>
      <span className="timer-num">{running ? Math.max(0, Math.ceil(left)) : 0}</span>
    </div>
  )
}
