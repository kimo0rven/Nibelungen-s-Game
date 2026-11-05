import { useEffect, useState } from 'react'
import { CARDS } from '../../lib/cards'
import CardArt from '../../components/CardArt'

// Mirrors the server rules in supabase/schema.sql (play_card / random_card).
const DETAILS = {
  metaller: { effect: 'Silence', duration: '4 seconds', counter: 'Maarduk, Angeling', odds: 'Common hostile', rules: 'Target cannot submit an answer while silenced.' },
  hatii: { effect: 'Freeze', duration: '4 seconds (6 taps thaw early)', counter: 'Maarduk, Angeling', odds: 'Common hostile', rules: 'Target is locked out. Tapping the thaw button 6 times ends it early.' },
  dragonoid: { effect: 'Burn', duration: '5 seconds', counter: 'Maarduk, Angeling', odds: 'Common hostile', rules: 'Two random choices become “too hot to touch”. Choice questions only.' },
  savage: { effect: 'Stun', duration: '4 seconds', counter: 'Giearth, Angeling', odds: 'Common hostile', rules: 'Question text is jumbled. Needs the visual effects setting on.' },
  requiem: { effect: 'Confusion', duration: '4 seconds', counter: 'Giearth, Angeling', odds: 'Common hostile', rules: 'Choice text is jumbled. Choice questions only; needs visual effects on.' },
  familiar: { effect: 'Darkness', duration: '3 seconds', counter: 'Giearth, Angeling', odds: 'Common hostile', rules: 'Target’s screen goes black. Needs visual effects on.' },
  plankton: { effect: 'Blur', duration: '4 seconds', counter: 'Giearth, Angeling', odds: 'Common hostile', rules: 'Question and choices are blurred. Needs visual effects on.' },
  kraken: { effect: 'Critical Wound', duration: 'This question', counter: 'Hard Explosion, Angeling', odds: 'Common hostile', rules: 'Target scores ×0.7 points.' },
  boa: { effect: 'Poison', duration: '6 seconds drain', counter: 'Hard Explosion, Angeling', odds: 'Common hostile', rules: 'Points drain linearly down to −40% over 6 seconds.' },
  skeleton: { effect: 'Slow', duration: 'This question', counter: 'Hard Explosion, Angeling', odds: 'Common hostile', rules: 'Target gets 70% of the time and ×0.7 points.' },
  atroce: { effect: 'Boost', duration: 'This question', counter: '—', odds: 'Self card (2× weight)', rules: 'Correct answer scores ×1.5. Play before answering.' },
  phreeoni: { effect: 'Double', duration: 'This question', counter: '—', odds: 'Self card (rare, 1× weight)', rules: 'Correct answer scores ×2. Play before answering.' },
  ghostring: { effect: 'Untargetable', duration: 'This question', counter: '—', odds: 'Self card (2× weight)', rules: 'Hostile cards cannot be aimed at you.' },
  angeling: { effect: 'Immunity', duration: 'This question', counter: '—', odds: 'Self card (2× weight)', rules: 'Blocks every card effect without using up a passive, and cleanses effects already on you.' },
  osiris: { effect: 'Skip', duration: 'This question', counter: '—', odds: 'Self card (2× weight)', rules: 'Skips the question; your streak is kept.' },
  doppel: { effect: '50/50', duration: 'This question', counter: '—', odds: 'Self card (2× weight)', rules: 'Removes wrong choices. Single-choice questions with 3+ options only.' },
  maarduk: { effect: 'Lockout immunity', duration: 'One block', counter: '—', odds: 'Passive (~10% of draws)', rules: 'Held in hand; auto-blocks Silence, Freeze or Burn once. The attacker’s card is still spent.' },
  giearth: { effect: 'Mind immunity', duration: 'One block', counter: '—', odds: 'Passive (~10% of draws)', rules: 'Held in hand; auto-blocks Stun, Confusion, Darkness or Blur once.' },
  hardexp: { effect: 'Body immunity', duration: 'One block', counter: '—', odds: 'Passive (~10% of draws)', rules: 'Held in hand; auto-blocks Wound, Poison or Slow once.' },
}

const GROUPS = [
  { type: 'hostile', title: 'Hostile cards' },
  { type: 'self', title: 'Self cards' },
  { type: 'passive', title: 'Passive immunities' },
]

export default function CardLibrary() {
  const [sel, setSel] = useState(null)

  useEffect(() => {
    if (!sel) return
    const onKey = (e) => e.key === 'Escape' && setSel(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sel])

  const c = sel && CARDS[sel]
  const d = sel && DETAILS[sel]

  return (
    <div>
      <h1>Card Library</h1>
      <p className="muted">Click a card to see how it works.</p>
      {GROUPS.map((g) => (
        <section key={g.type}>
          <h2 className="lib-heading">{g.title}</h2>
          <div className="lib-grid">
            {Object.entries(CARDS)
              .filter(([, v]) => v.type === g.type)
              .map(([id, v]) => (
                <button key={id} className={`lib-card ${g.type}`} onClick={() => setSel(id)}>
                  <CardArt id={id} />
                  <span>{v.name}</span>
                </button>
              ))}
          </div>
        </section>
      ))}

      {c && (
        <div className="lib-overlay" onClick={() => setSel(null)}>
          <div className={`lib-modal ${c.type}`} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <button className="lib-close" onClick={() => setSel(null)} aria-label="Close">✕</button>
            <CardArt id={sel} className="lib-big" />
            <h2>{c.name}</h2>
            <p className="lib-type">{c.type}</p>
            <p>{c.blurb}</p>
            <dl>
              <dt>Effect</dt><dd>{d.effect}</dd>
              <dt>Duration</dt><dd>{d.duration}</dd>
              <dt>Countered by</dt><dd>{d.counter}</dd>
              <dt>Drop rate</dt><dd>{d.odds}</dd>
              <dt>Rules</dt><dd>{d.rules}</dd>
            </dl>
            <p className="muted lib-id">id: {sel}</p>
          </div>
        </div>
      )}
    </div>
  )
}
