import { useEffect } from 'react'
import { CARDS } from '../lib/cards'
import CardArt from './CardArt'

// Full-screen flourish. mode: 'play' (you cast), 'hit' (cast on you), 'blocked' (shielded).
export default function CardCast({ cast, onDone }) {
  useEffect(() => {
    if (!cast) return
    const t = setTimeout(onDone, 2000)
    return () => clearTimeout(t)
  }, [cast, onDone])
  if (!cast) return null
  const c = CARDS[cast.kind]
  const title =
    cast.mode === 'public'
      ? cast.self
        ? `${cast.from} played ${c.name}`
        : cast.blocked
          ? `${cast.target} blocked ${c.name} from ${cast.from}!`
          : `${cast.from} cast ${c.name} on ${cast.target}!`
      : cast.mode === 'hit'
      ? `${cast.from} cast ${c.name} on you!`
      : cast.mode === 'blocked'
        ? cast.from
          ? `Blocked ${c.name} from ${cast.from}!`
          : `${c.name} was blocked!`
        : cast.target
          ? `${c.name} → ${cast.target}`
          : c.name
  return (
    <div className={`cast-overlay ${cast.mode === 'public' ? (cast.blocked ? 'blocked' : 'play') : cast.mode}`} aria-live="polite">
      <div className="cast-card">
        <CardArt id={cast.kind} />
        <b>{c.name}</b>
      </div>
      <p className="cast-title">{cast.mode === 'blocked' || cast.blocked ? '🛡 ' : ''}{title}</p>
    </div>
  )
}
