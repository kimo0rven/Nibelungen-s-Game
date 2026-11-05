import { useState, useSyncExternalStore } from 'react'
import { soundStore, sfx, TRACK_LIST } from '../lib/sound'

export default function MuteButton({ className = '' }) {
  const s = useSyncExternalStore(soundStore.subscribe, soundStore.getSnapshot)
  const [open, setOpen] = useState(false)
  return (
    <div className={`audio-wrap ${className}`}>
      <button
        type="button"
        className="mute-btn"
        aria-label="Sound settings"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {s.muted ? '🔇' : '🔊'}
      </button>
      {open && (
        <div className="audio-pop pixel-box" onClick={(e) => e.stopPropagation()}>
          <label className="audio-row">
            <input
              type="checkbox"
              checked={s.muted}
              onChange={() => soundStore.toggle()}
            />
            Mute all
          </label>
          <label className="audio-row col">
            Music {Math.round(s.music * 100)}%
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={s.music}
              onChange={(e) => soundStore.set({ music: Number(e.target.value) })}
            />
          </label>
          <label className="audio-row col">
            Effects {Math.round(s.sfx * 100)}%
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={s.sfx}
              onChange={(e) => soundStore.set({ sfx: Number(e.target.value) })}
              onPointerUp={() => sfx.select()}
            />
          </label>
          <label className="audio-row col">
            Track
            <select
              className="input"
              value={s.track}
              onChange={(e) => soundStore.set({ track: e.target.value })}
            >
              {TRACK_LIST.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </div>
  )
}
