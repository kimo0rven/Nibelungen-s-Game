import { useState } from 'react'
import { CARDS } from '../lib/cards'

// Uses /cards/<id>.jpeg when present, otherwise falls back to the card's emoji.
export default function CardArt({ id, className = '' }) {
  const [failed, setFailed] = useState(false)
  const c = CARDS[id]
  if (!c) return null
  return failed ? (
    <span className={`card-icon ${className}`}>{c.icon}</span>
  ) : (
    <img
      className={`card-art ${className}`}
      src={`/cards/${id}.jpeg`}
      alt=""
      draggable={false}
      onError={() => setFailed(true)}
    />
  )
}
