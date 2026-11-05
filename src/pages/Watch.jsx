import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Leaderboard from '../components/Leaderboard'
import QuestionBoard from '../components/QuestionBoard'
import Timer from '../components/Timer'
import Podium from '../components/Podium'
import CardCast from '../components/CardCast'
import MuteButton from '../components/MuteButton'
import { sfx, startMusic, stopMusic } from '../lib/sound'

// Read-only big-screen view for projectors. Polls a server feed that never includes the key before reveal.
export default function Watch() {
  const { code } = useParams()
  const { ensurePlayer } = useAuth()
  const [state, setState] = useState(undefined)
  const [offset, setOffset] = useState(0)
  const [cast, setCast] = useState(null)
  const seen = useRef(new Set())
  const started = useRef(false)

  useEffect(() => {
    let alive = true
    const load = async () => {
      const { data } = await supabase.rpc('get_spectator_state', { p_code: code })
      if (!alive) return
      if (data) setOffset(new Date(data.server_now).getTime() - Date.now())
      setState(data ?? null)
    }
    let id
    ensurePlayer().then(() => {
      load()
      id = setInterval(load, 1500)
    })
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [code, ensurePlayer])

  const status = state?.quiz.status
  const phase = state?.quiz.phase
  const qid = state?.question?.id

  useEffect(() => {
    if (status === 'lobby' || status === 'live') startMusic()
    else stopMusic()
    return stopMusic
  }, [status])

  useEffect(() => {
    if (phase === 'reveal') sfx.reveal()
  }, [phase, qid])

  const plays = state?.plays
  useEffect(() => {
    // First poll only marks existing plays as seen so a fresh page load doesn't replay them.
    const fresh = (plays ?? []).filter((p) => !seen.current.has(p.id))
    fresh.forEach((p) => seen.current.add(p.id))
    const latest = fresh.at(-1)
    if (latest && started.current) {
      setCast({ kind: latest.kind, mode: 'public', from: latest.from, target: latest.target, blocked: latest.blocked, self: latest.self })
      sfx.reveal()
    }
    if (plays) started.current = true
  }, [plays])

  if (state === undefined) return <div className="game-page center-page"><p className="blink">LOADING…</p></div>
  if (state === null)
    return (
      <div className="game-page center-page">
        <div className="pixel-box"><p className="error-text">Quiz not found, or big-screen view is disabled.</p></div>
      </div>
    )

  const { quiz, players, question: q, key, answered } = state
  const teamCount = quiz.settings?.team_mode ? quiz.settings.team_count || 2 : 0
  const showStreaks = quiz.settings?.streaks !== false

  return (
    <div className="game-page watch">
      <CardCast cast={cast} onDone={() => setCast(null)} />
      <header className="host-bar">
        <b>{quiz.title}</b>
        <MuteButton />
      </header>
      {(status === 'draft' || status === 'lobby') && (
        <div className="center-page">
          <div className="pixel-box lobby pop-in">
            <p>JOIN AT <b>{window.location.host}</b> WITH CODE</p>
            <div className="join-code glitch">{quiz.join_code}</div>
            <div className="chips">
              {players.map((p) => <span key={p.id} className="chip pop-in">{p.name}</span>)}
            </div>
            <p className="blink">{players.length} WARRIOR{players.length === 1 ? '' : 'S'} GATHERED</p>
          </div>
        </div>
      )}
      {status === 'live' && (
        <div className="stage">
          <div className="stage-main">
            {q ? (
              <>
                <div className="progress">Q {quiz.current_index + 1} / {quiz.question_count} · {answered}/{players.length} answered</div>
                <Timer
                  key={q.id}
                  startedAt={quiz.question_started_at}
                  limit={q.time_limit}
                  offset={offset}
                  running={phase === 'question'}
                  pausedAt={quiz.paused_at}
                />
                <QuestionBoard key={q.id} question={q} phase={phase} answerKey={key} myAnswer={null} onSubmit={null} />
                {quiz.paused_at && <p className="pause-banner blink">⏸ PAUSED</p>}
              </>
            ) : (
              <p className="blink">LOADING…</p>
            )}
          </div>
          <Leaderboard players={players} teamCount={teamCount} showStreaks={showStreaks} />
        </div>
      )}
      {status === 'finished' && (
        <div className="stage">
          <div className="stage-main">
            <h2 className="logo small glitch">RAGNAROK ENDS</h2>
            <Podium players={players} />
          </div>
          <Leaderboard players={players} teamCount={teamCount} />
        </div>
      )}
    </div>
  )
}
