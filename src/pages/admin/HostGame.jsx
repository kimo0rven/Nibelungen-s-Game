import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { supabase, friendlyError } from '../../lib/supabase'
import { useLiveQuiz } from '../../lib/useLiveQuiz'
import { sfx, startMusic, stopMusic } from '../../lib/sound'
import Leaderboard from '../../components/Leaderboard'
import QuestionBoard from '../../components/QuestionBoard'
import Timer from '../../components/Timer'
import MuteButton from '../../components/MuteButton'
import Podium from '../../components/Podium'
import CardCast from '../../components/CardCast'
import { StatusBadge } from './statusBadge'

export default function HostGame() {
  const { id } = useParams()
  const { quiz, players, questions, answers, offset, error } = useLiveQuiz(id, { isHost: true })
  const [answerKey, setAnswerKey] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [copied, setCopied] = useState(false)
  const [cast, setCast] = useState(null)
  const playersRef = useRef([])
  useEffect(() => {
    playersRef.current = players
  }, [players])
  const cardsOn = quiz?.settings?.cards !== false

  const status = quiz?.status
  const phase = quiz?.phase
  const q = quiz && questions.find((x) => x.idx === quiz.current_index)

  const act = useCallback(
    async (action) => {
      setActionError(null)
      const { error: e } = await supabase.rpc('host_advance', { p_quiz: id, p_action: action })
      if (e) setActionError(friendlyError(e))
    },
    [id],
  )

  useEffect(() => {
    if (status === 'lobby' || status === 'live') startMusic()
    else stopMusic()
    return stopMusic
  }, [status])

  useEffect(() => {
    if (status === 'live') sfx.start()
    if (status === 'finished') sfx.fanfare()
  }, [status])

  useEffect(() => {
    if (phase !== 'reveal' || status !== 'live') return
    supabase.rpc('get_reveal', { p_quiz: id }).then(({ data }) => {
      setAnswerKey(data)
      sfx.reveal()
    })
    return () => setAnswerKey(null)
  }, [phase, status, q?.id, id])

  // Show every card play to the room (the host can read all card_effects of their quiz).
  useEffect(() => {
    if (!cardsOn || status !== 'live') return
    const ch = supabase
      .channel(`host-fx-${id}`)
      .on('postgres_changes', { schema: 'public', event: 'INSERT', table: 'card_effects', filter: `quiz_id=eq.${id}` }, (p) => {
        const e = p.new
        const name = (pid) => playersRef.current.find((x) => x.id === pid)?.name ?? '???'
        setCast({
          kind: e.kind,
          mode: 'public',
          from: name(e.source_player_id),
          target: name(e.target_player_id),
          blocked: e.blocked,
          self: e.source_player_id === e.target_player_id,
        })
        sfx.reveal()
      })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [cardsOn, status, id])

  const qAnswers = q ? answers.filter((a) => a.question_id === q.id) : []

  // Answers and scores are revealed only once the timer has run out (the server enforces this too).
  const revealAfterTimer = useCallback(async () => {
    for (let i = 0; i < 6; i++) {
      await new Promise((r) => setTimeout(r, i === 0 ? 1100 : 500))
      const { error: e } = await supabase.rpc('host_advance', { p_quiz: id, p_action: 'reveal' })
      if (!e || e.message !== 'too_early') return
    }
  }, [id])

  const kick = async (p, ban) => {
    if (!confirm(`${ban ? 'Ban' : 'Remove'} ${p.name}?`)) return
    const { error: e } = await supabase.rpc('kick_player', { p_quiz: id, p_player: p.id, p_ban: ban })
    if (e) setActionError(friendlyError(e))
  }

  const autoAdvance = Boolean(quiz?.settings?.auto_advance)
  const revealSeconds = quiz?.settings?.reveal_seconds || 6
  const paused = Boolean(quiz?.paused_at)
  useEffect(() => {
    if (!autoAdvance || status !== 'live' || phase !== 'reveal' || paused) return
    const t = setTimeout(() => act('next'), revealSeconds * 1000)
    return () => clearTimeout(t)
  }, [autoAdvance, status, phase, paused, revealSeconds, q?.id, act])

  if (error) return <p className="error-text">{error.message}</p>
  if (!quiz) return <p className="muted">Loading… (if this persists, the quiz doesn't exist)</p>

  const joinUrl = `${window.location.origin}/play/${quiz.join_code}`
  const copy = async () => {
    await navigator.clipboard.writeText(joinUrl)
    sfx.select()
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const watchUrl = `${window.location.origin}/watch/${quiz.join_code}`
  const copyWatch = async () => {
    await navigator.clipboard.writeText(watchUrl)
    sfx.select()
    setCopied('watch')
    setTimeout(() => setCopied(false), 1500)
  }
  const teamCount = quiz.settings?.team_mode ? quiz.settings.team_count || 2 : 0
  const showStreaks = quiz.settings?.streaks !== false

  const lastQuestion = quiz.current_index + 1 >= quiz.question_count

  return (
    <div className="host-screen game-page">
      <CardCast cast={cast} onDone={() => setCast(null)} />
      <header className="host-bar">
        <div>
          <b>{quiz.title}</b> <StatusBadge status={status} />
        </div>
        <div className="actions">
          <MuteButton />
          <Link className="abtn" to="/admin/quizzes">Exit</Link>
        </div>
      </header>
      {actionError && <p className="error-text">{actionError}</p>}

      {(status === 'draft' || status === 'lobby') && (
        <div className="stage">
          <div className="stage-main">
            <div className="pixel-box lobby pop-in">
              {status === 'draft' ? (
                <>
                  <h2>Ready to host?</h2>
                  <p>Open the lobby so players can join with the code.</p>
                  <div className="actions center">
                    <button className="btn big" onClick={() => act('open')}>OPEN LOBBY</button>
                    <Link className="btn ghost" to={`/admin/quizzes/${id}/edit`}>EDIT QUIZ</Link>
                  </div>
                </>
              ) : (
                <>
                  <p>JOIN AT <b>{window.location.host}</b> WITH CODE</p>
                  <div className="join-code glitch">{quiz.join_code}</div>
                  <button className="btn" onClick={copy}>{copied === true ? 'COPIED!' : 'COPY LINK'}</button>
                  {quiz.settings?.allow_spectators !== false && (
                    <button className="btn ghost" onClick={copyWatch}>{copied === 'watch' ? 'COPIED!' : 'COPY BIG-SCREEN LINK'}</button>
                  )}
                  <div className="chips">
                    {players.map((p) => (
                      <span key={p.id} className="chip pop-in">
                        {p.name} <button className="chip-x" onClick={() => kick(p, false)} aria-label={`Remove ${p.name}`}>✕</button>
                        <button className="chip-x" onClick={() => kick(p, true)} aria-label={`Ban ${p.name}`}>🚫</button>
                      </span>
                    ))}
                  </div>
                  <p className="blink">{players.length} PLAYER{players.length === 1 ? '' : 'S'} WAITING</p>
                  <div className="actions center">
                    <button className="btn big" disabled={players.length === 0} onClick={() => act('start')}>START ▶</button>
                    <button className="btn ghost" onClick={() => confirm('Close lobby and remove players?') && act('close')}>CLOSE LOBBY</button>
                  </div>
                </>
              )}
            </div>
          </div>
          {status === 'lobby' && <Leaderboard players={players} showFlags teamCount={teamCount} onKick={kick} />}
        </div>
      )}

      {status === 'live' && (
        <div className="stage">
          <div className="stage-main">
            {q ? (
              <>
                <div className="progress">
                  Q {quiz.current_index + 1} / {quiz.question_count} · {qAnswers.length}/{players.length} answered
                </div>
                <Timer
                  key={q.id}
                  startedAt={quiz.question_started_at}
                  limit={q.time_limit}
                  offset={offset}
                  running={phase === 'question'}
                  pausedAt={quiz.paused_at}
                  onExpire={revealAfterTimer}
                />
                <QuestionBoard key={q.id} question={q} phase={phase} answerKey={answerKey} myAnswer={null} onSubmit={null}>
                  {phase === 'reveal' && <Distribution q={q} answers={qAnswers} />}
                </QuestionBoard>
                {paused && <p className="pause-banner blink">⏸ PAUSED</p>}
                {autoAdvance && phase === 'reveal' && !paused && (
                  <div className="countdown"><div key={q.id} style={{ animationDuration: `${revealSeconds}s` }} /></div>
                )}
                <div className="actions center">
                  {phase === 'question' ? (
                    <>
                      <p className="blink">ANSWER REVEALED WHEN THE TIMER ENDS…</p>
                      <button className="btn ghost" onClick={() => act(paused ? 'resume' : 'pause')}>
                        {paused ? '▶ RESUME' : '⏸ PAUSE'}
                      </button>
                    </>
                  ) : (
                    <button className="btn big" onClick={() => act('next')}>{lastQuestion ? 'FINISH' : 'NEXT ▶'}</button>
                  )}
                  <button className="btn ghost" onClick={() => confirm('End the quiz now?') && act('finish')}>END QUIZ</button>
                </div>
              </>
            ) : (
              <p className="blink">LOADING…</p>
            )}
          </div>
          <Leaderboard players={players} showFlags teamCount={teamCount} showStreaks={showStreaks} onKick={kick} />
        </div>
      )}

      {status === 'finished' && (
        <div className="stage">
          <div className="stage-main">
            <h2 className="logo small glitch">RAGNAROK ENDS</h2>
            <Podium players={players} />
            <div className="actions center">
              <button className="btn big" onClick={() => act('reset')}>FIGHT AGAIN (RESET)</button>
              <Link className="btn ghost" to="/admin/quizzes">BACK TO QUIZZES</Link>
            </div>
          </div>
          <Leaderboard players={players} showFlags teamCount={teamCount} />
        </div>
      )}
    </div>
  )
}

function Distribution({ q, answers }) {
  if (!['single', 'multiple', 'true_false'].includes(q.type)) {
    const ok = answers.filter((a) => a.is_correct).length
    return <p className="you-said">{ok} of {answers.length} answered correctly</p>
  }
  const count = (o) => answers.filter((a) => a.answer.selected?.includes(o.id)).length
  const max = Math.max(1, ...q.options.map(count))
  return (
    <div className="dist">
      {q.options.map((o, i) => (
        <div key={o.id} className="dist-col">
          <span>{count(o)}</span>
          <div className={`dist-bar c${i % 6}`} style={{ '--h': `${(count(o) / max) * 80 + 4}px` }} />
        </div>
      ))}
    </div>
  )
}
