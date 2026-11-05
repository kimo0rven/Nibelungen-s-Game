// Ragnarok Online–style monster cards. Behaviour is enforced server-side (play_card / submit_answer).
export const CARDS = {
  metaller: { name: 'Metaller', icon: '🤐', type: 'hostile', blurb: 'Silence a player: they cannot answer for 4s.' },
  hatii: { name: 'Hatii Bebe', icon: '❄', type: 'hostile', blurb: 'Freeze a player: locked for 4s, but 6 rapid taps thaw them early.' },
  dragonoid: { name: 'Mutant Dragonoid', icon: '🔥', type: 'hostile', blurb: 'Fireball: burns 2 choices for 5s. Choice questions only.', choiceOnly: true },
  savage: { name: 'Savage Baby', icon: '💫', type: 'hostile', blurb: 'Stun: the question text gets jumbled for 4s.', visual: true },
  requiem: { name: 'Requiem', icon: '🌀', type: 'hostile', blurb: 'Confusion: choice letters get jumbled for 4s. Choice questions only.', visual: true, choiceOnly: true },
  familiar: { name: 'Familiar', icon: '🌑', type: 'hostile', blurb: 'Darkness: the target’s screen goes black for 3s.', visual: true },
  plankton: { name: 'Plankton', icon: '🫧', type: 'hostile', blurb: 'Blurs the question and choices for 4s.', visual: true },
  kraken: { name: 'Kraken', icon: '🩸', type: 'hostile', blurb: 'Critical Wound: target scores 30% less this question.' },
  boa: { name: 'Boa', icon: '☠', type: 'hostile', blurb: 'Poison: target’s points drain to −40% over 6s. Answer fast!' },
  skeleton: { name: 'Skeleton', icon: '🐌', type: 'hostile', blurb: 'Slow: target gets 30% less time AND max 70% of the points.' },
  atroce: { name: 'Atroce', icon: '⭐', type: 'self', blurb: 'Your correct answer scores 50% more this question.' },
  ghostring: { name: 'Ghostring', icon: '👻', type: 'self', blurb: 'Nobody can target you this question.' },
  angeling: { name: 'Angeling', icon: '😇', type: 'self', blurb: 'Immune to all card effects this question, and cleanses any already on you.' },
  phreeoni: { name: 'Phreeoni', icon: '✦', type: 'self', blurb: 'Doubles your points if you answer correctly this question.' },
  osiris: { name: 'Osiris', icon: '↷', type: 'self', blurb: 'Skip this question without breaking your streak.' },
  doppel: { name: 'Doppelganger', icon: '½', type: 'self', blurb: '50/50: removes wrong choices. Single-choice questions with 3+ options only.', singleOnly: true },
  maarduk: { name: 'Maarduk', icon: '🛡', type: 'passive', blurb: 'Auto-blocks one lockout: Silence, Freeze or Burn.' },
  giearth: { name: 'Giearth', icon: '🛡', type: 'passive', blurb: 'Auto-blocks one mind effect: Stun, Confusion, Darkness or Blur.' },
  hardexp: { name: 'Hard Explosion', icon: '🛡', type: 'passive', blurb: 'Auto-blocks one body effect: Wound, Poison or Slow.' },
}

export const STATUS = {
  silence: { icon: '🤐', label: 'Silenced' },
  freeze: { icon: '❄', label: 'Frozen (tap to thaw!)' },
  burn: { icon: '🔥', label: 'Burning' },
  stun: { icon: '💫', label: 'Stunned' },
  confusion: { icon: '🌀', label: 'Confused' },
  darkness: { icon: '🌑', label: 'Blinded' },
  blur: { icon: '🫧', label: 'Blurred' },
  wound: { icon: '🩸', label: 'Critical Wound (-30% pts)' },
  poison: { icon: '☠', label: 'Poisoned (points draining)' },
  slow: { icon: '🐌', label: 'Slowed (-30% time & pts)' },
  boost: { icon: '⭐', label: 'Atroce (+50% pts)' },
  immune: { icon: '😇', label: 'Angeling (immune)' },
  double: { icon: '✦', label: 'Phreeoni (x2 pts)' },
  skip: { icon: '↷', label: 'Skipped' },
  fifty: { icon: '½', label: 'Doppelganger (50/50)' },
  ghost: { icon: '👻', label: 'Ghostring (untargetable)' },
}

// Deterministic letter shuffle so jumbled text doesn't flicker between renders.
export function scramble(text, seed) {
  let h = 0
  for (const c of String(seed)) h = (h * 31 + c.charCodeAt(0)) >>> 0
  const rand = () => {
    h = (h * 1664525 + 1013904223) >>> 0
    return h / 4294967296
  }
  return text
    .split(/(\s+)/)
    .map((w) => {
      if (w.length < 3 || /^\s+$/.test(w)) return w
      const a = [...w]
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1))
        ;[a[i], a[j]] = [a[j], a[i]]
      }
      return a.join('')
    })
    .join('')
}
