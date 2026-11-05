// 8-bit sound effects + chiptune loops synthesised with WebAudio (no asset files).
let ctx
let sfxBus
let musicBus
const listeners = new Set()
const KEY = 'qg-audio'

function load() {
  const base = { muted: false, music: 0.7, sfx: 1, track: 'battle' }
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null')
    if (saved) return { ...base, ...saved }
    if (localStorage.getItem('qg-muted') === '1') base.muted = true
  } catch {
    /* ignore corrupt storage */
  }
  return base
}
let settings = load()

function audio() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)()
    sfxBus = ctx.createGain()
    musicBus = ctx.createGain()
    sfxBus.connect(ctx.destination)
    musicBus.connect(ctx.destination)
  }
  sfxBus.gain.value = settings.sfx
  musicBus.gain.value = settings.music
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

const live = new Set()
function tone(freq, at, dur, type = 'square', vol = 0.06, bus = 'sfx', track = false) {
  const c = audio()
  const o = c.createOscillator()
  const g = c.createGain()
  const t = c.currentTime + at
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  g.gain.setValueAtTime(vol, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(bus === 'music' ? musicBus : sfxBus)
  o.start(t)
  o.stop(t + dur + 0.02)
  if (track) {
    live.add(o)
    o.onended = () => live.delete(o)
  }
}

function play(notes, type, vol) {
  if (settings.muted || settings.sfx <= 0) return
  notes.forEach(([f, at, d]) => tone(f, at, d, type, vol))
}

export const sfx = {
  click: () => play([[660, 0, 0.06]]),
  select: () => play([[520, 0, 0.05], [780, 0.05, 0.07]]),
  join: () => play([[220, 0, 0.1], [330, 0.1, 0.1], [440, 0.2, 0.18]]),
  tick: () => play([[1200, 0, 0.04]], 'square', 0.03),
  start: () => play([[110, 0, 0.18], [110, 0.22, 0.18], [165, 0.44, 0.18], [220, 0.66, 0.4]], 'sawtooth', 0.05),
  correct: () => play([[523, 0, 0.09], [659, 0.09, 0.09], [784, 0.18, 0.09], [1047, 0.27, 0.25]]),
  wrong: () => play([[220, 0, 0.15], [165, 0.15, 0.15], [110, 0.3, 0.3]], 'sawtooth', 0.05),
  reveal: () => play([[440, 0, 0.08], [440, 0.12, 0.08], [660, 0.24, 0.2]]),
  fanfare: () =>
    play([[523, 0, 0.12], [523, 0.14, 0.12], [523, 0.28, 0.12], [659, 0.42, 0.2], [784, 0.64, 0.12], [659, 0.78, 0.12], [1047, 0.92, 0.45]]),
}

const TRACKS = {
  battle: {
    label: 'War Drums',
    step: 0.16,
    lead: [440, 523, 659, 523, 440, 523, 698, 659, 392, 494, 587, 494, 330, 392, 440, 523],
    leadType: 'square',
    bass: [110, 110, 110, 110, 98, 98, 87, 82],
    drums: true,
  },
  valhalla: {
    label: 'Halls of Valhalla',
    step: 0.3,
    lead: [330, 392, 440, 392, 330, 294, 330, 392, 262, 330, 392, 330, 294, 262, 247, 294],
    leadType: 'triangle',
    bass: [82, 82, 73, 73, 65, 65, 73, 82],
    drums: false,
  },
  bifrost: {
    label: 'Bifrost Bridge',
    step: 0.13,
    lead: [523, 659, 784, 659, 523, 659, 880, 784, 587, 698, 880, 698, 523, 659, 784, 1047],
    leadType: 'square',
    bass: [131, 131, 147, 147, 165, 165, 147, 131],
    drums: false,
  },
}
export const TRACK_LIST = [...Object.entries(TRACKS).map(([id, t]) => ({ id, label: t.label })), { id: 'none', label: 'No music' }]

let musicTimer
let wantMusic = false
function runMusic() {
  clearTimeout(musicTimer)
  musicTimer = null
  live.forEach((o) => {
    try {
      o.stop()
    } catch {
      /* already stopped */
    }
  })
  live.clear()
  const tr = TRACKS[settings.track]
  if (!wantMusic || settings.muted || !tr) return
  const bar = () => {
    const s = tr.step
    tr.lead.forEach((f, i) => tone(f, i * s, s * 0.75, tr.leadType, 0.018, 'music', true))
    tr.bass.forEach((f, i) => tone(f, i * s * 2, s * 1.75, 'triangle', 0.05, 'music', true))
    if (tr.drums) for (let i = 0; i < 8; i++) tone(i % 2 ? 70 : 55, i * s * 2, 0.12, 'sawtooth', 0.04, 'music', true)
    musicTimer = setTimeout(bar, 16 * s * 1000)
  }
  bar()
}
export function startMusic() {
  wantMusic = true
  if (!musicTimer) runMusic()
}
export function stopMusic() {
  wantMusic = false
  runMusic()
}

function emit() {
  settings = { ...settings }
  localStorage.setItem(KEY, JSON.stringify(settings))
  if (ctx) {
    sfxBus.gain.value = settings.sfx
    musicBus.gain.value = settings.music
  }
  listeners.forEach((fn) => fn())
}

export const soundStore = {
  subscribe(fn) {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },
  getSnapshot: () => settings,
  toggle() {
    settings.muted = !settings.muted
    emit()
    runMusic()
  },
  set(patch) {
    const trackChanged = patch.track && patch.track !== settings.track
    Object.assign(settings, patch)
    emit()
    if (trackChanged || 'muted' in patch) runMusic()
  },
}
