import { useState } from 'react'
import { useNavigate } from 'react-router'
import { sfx } from '../lib/sound'
import MuteButton from '../components/MuteButton'
import { isConfigured } from '../lib/supabase'

export default function Home() {
  const [code, setCode] = useState('')
  const navigate = useNavigate()

  return (
    <div className="game-page center-page">
      <MuteButton className="corner" />
      <div className="title-card">
        <h1 className="logo glitch">
          <span>NIBELUNGEN'S</span> <span className="alt">GAME</span>
        </h1>
        <p className="blink">THE END OF DAYS AWAITS</p>
        <form
          className="pixel-box join-box"
          onSubmit={(e) => {
            e.preventDefault()
            if (!code.trim()) return
            sfx.start()
            navigate(`/play/${code.trim().toUpperCase()}`)
          }}
        >
          <label htmlFor="code">BATTLE CODE</label>
          <input
            id="code"
            className="input code-input"
            maxLength={6}
            autoFocus
            autoComplete="off"
            placeholder="ABC123"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
          <button className="btn big">ENTER ▶</button>
        </form>
        {!isConfigured && (
          <p className="error-text">Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — see README.</p>
        )}
      </div>
    </div>
  )
}
