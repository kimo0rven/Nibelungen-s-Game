import { useState } from 'react'
import { CARDS } from '../lib/cards'
import CardArt from './CardArt'

// The player's hand. Hostile cards open a target picker; self cards play instantly; passive cards trigger automatically.
export default function CardHand({ hand, played, disabled, visualsOn, questionType, players, me, teamMode, onPlay }) {
  const [picking, setPicking] = useState(null)
  const owned = Object.entries(hand ?? {}).filter(([k, n]) => n > 0 && CARDS[k])
  const targets = players
    .filter((p) => p.id !== me?.id && !(teamMode && me?.team != null && p.team === me.team))
    .sort((a, b) => b.score - a.score)
  const choiceQ = ['single', 'multiple', 'true_false'].includes(questionType)

  if (!owned.length && !played) return <p className="muted hand-empty">No cards — you draw more every 3 questions.</p>

  const why = (id, c) => {
    if (played) return 'Already played a card this question'
    if (disabled) return 'Not available right now'
    if (c.type === 'passive') return 'Triggers automatically'
    if (c.visual && !visualsOn) return 'Visual effects are disabled'
    if (c.singleOnly && questionType !== 'single') return 'Only works on single-answer questions'
    if (c.choiceOnly && !choiceQ) return 'Only works on choice questions'
    return null
  }

  return (
    <div className="hand">
      <div className="hand-row">
        {owned.map(([id, n]) => {
          const c = CARDS[id]
          const blocked = why(id, c)
          return (
            <button
              key={id}
              type="button"
              className={`card-btn ${c.type} ${picking === id ? 'sel' : ''}`}
              disabled={Boolean(blocked) && c.type !== 'passive'}
              title={`${c.blurb}${blocked ? ` (${blocked})` : ''}`}
              onClick={() => {
                if (c.type === 'passive') return
                if (c.type === 'hostile') return setPicking(picking === id ? null : id)
                onPlay(id, null)
              }}
            >
              <CardArt id={id} />
              <span className="card-name">{c.name}</span>
              <b>×{n}</b>
              <small>{c.type === 'passive' ? 'AUTO' : c.type === 'self' ? 'SELF' : 'ATTACK'}</small>
            </button>
          )
        })}
      </div>
      {picking && (
        <div className="target-pick pixel-box">
          <p>{CARDS[picking].icon} {CARDS[picking].name} — {CARDS[picking].blurb}</p>
          {targets.length === 0 && <p className="muted">No valid targets.</p>}
          <div className="chips">
            {targets.map((p) => (
              <button
                key={p.id}
                type="button"
                className="chip target"
                onClick={() => {
                  onPlay(picking, p.id)
                  setPicking(null)
                }}
              >
                {p.name} <small>{p.score}</small>
              </button>
            ))}
          </div>
        </div>
      )}
      {played && (
        <p className="muted">
          Played {CARDS[played.kind]?.name}
          {played.target ? ` on ${played.target}` : ''}
          {played.blocked ? ' — blocked!' : ''}
        </p>
      )}
    </div>
  )
}
