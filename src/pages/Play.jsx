import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { teamOf } from '../lib/teams'
import { CARDS, STATUS } from '../lib/cards'
import CardHand from '../components/CardHand'
import CardCast from '../components/CardCast'
import { friendlyError, supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useLiveQuiz } from '../lib/useLiveQuiz'
import { sfx, startMusic, stopMusic } from '../lib/sound'
import Leaderboard from '../components/Leaderboard'
import QuestionBoard from '../components/QuestionBoard'
import Timer from '../components/Timer'
import MuteButton from '../components/MuteButton'
import Podium from '../components/Podium'
import { useAntiCheat } from '../lib/useAntiCheat'

export default function Play() {
  const { code } = useParams()
  const { ensurePlayer } = useAuth()
  const [info, setInfo] = useState(null)
  const [player, setPlayer] = useState(null)
  const [error, setError] = useState(null)
  const [ready, setReady] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [rejoin, setRejoin] = useState(false)
  const [pin, setPin] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const user = await ensurePlayer()
        const { data: pub, error: e } = await supabase.rpc('get_quiz_public', { p_code: code })
        if (e) throw e
        if (!pub) throw new Error('quiz_not_found')
        const { data: mine } = await supabase
          .from('players')
          .select('*')
          .eq('quiz_id', pub.id)
          .eq('user_id', user.id)
          .maybeSingle()
        if (cancelled) return
        setInfo(pub)
        setPlayer(mine)
      } catch (e) {
        if (!cancelled) setError(friendlyError(e))
      } finally {
        if (!cancelled) setReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [code, ensurePlayer])

  const join = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { data, error: err } = rejoin
      ? await supabase.rpc('rejoin_quiz', { p_code: code, p_name: name, p_pin: pin })
      : await supabase.rpc('join_quiz', { p_code: code, p_name: name })
    setBusy(false)
    if (err || data?.error) {
      sfx.wrong()
      return setError(friendlyError(err || new Error(data.error)))
    }
    sfx.join()
    setPlayer(data)
  }

  if (!ready) return <div className="game-page center-page"><p className="blink">LOADING…</p></div>

  if (!info)
    return (
      <div className="game-page center-page">
        <div className="pixel-box">
          <p className="error-text">{error}</p>
          <Link className="btn" to="/">◀ BACK</Link>
        </div>
      </div>
    )

  if (!player)
    return (
      <div className="game-page center-page">
        <MuteButton className="corner" />
        <form className="pixel-box join-box pop-in" onSubmit={join}>
          <h2>{info.title}</h2>
          <label htmlFor="name">CHOOSE YOUR NAME</label>
          <input
            id="name"
            className="input"
            autoFocus
            maxLength={20}
            autoComplete="off"
            placeholder="Player 1"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          {rejoin && (
            <>
              <label htmlFor="pin">YOUR REJOIN PIN</label>
              <input
                id="pin"
                className="input"
                maxLength={6}
                autoComplete="off"
                placeholder="ABC123"
                value={pin}
                onChange={(e) => setPin(e.target.value.toUpperCase())}
              />
            </>
          )}
          {error && <p className="error-text">{error}</p>}
          <button className="btn big" disabled={busy || !name.trim() || (rejoin && pin.length < 6)}>
            {busy ? '…' : rejoin ? 'REJOIN ▶' : 'ENTER ▶'}
          </button>
          <button type="button" className="btn link" onClick={() => { setRejoin((r) => !r); setError(null) }}>
            {rejoin ? 'New player' : 'Lost connection? Rejoin with PIN'}
          </button>
        </form>
      </div>
    )

  return <PlayGame quizId={info.id} player={player} onKicked={() => { setError('You were removed from the game.'); setPlayer(null) }} />
}

function PlayGame({ quizId, player, onKicked }) {
  const { quiz, players, questions, offset } = useLiveQuiz(quizId)
  const [answerRow, setMyAnswer] = useState(null)
  const [answerKey, setAnswerKey] = useState(null)
  const [expiredFor, setExpiredFor] = useState(null)
  const [submitError, setSubmitError] = useState(null)
  const [cards, setCards] = useState(null)
  const [cardNote, setCardNote] = useState(null)
  const [cast, setCast] = useState(null)
  const [now, setNow] = useState(() => Date.now())
  const seenFx = useRef(new Set())
  const [pinShown, setPinShown] = useState(null)

  const q = quiz && questions.find((x) => x.idx === quiz.current_index)
  const qid = q?.id
  const phase = quiz?.phase
  const status = quiz?.status
  const me = players.find((p) => p.id === player.id)
  const { warning, dismiss } = useAntiCheat(quizId, status === 'live')
  const myAnswer = answerRow?.question_id === qid ? answerRow : null
  const paused = Boolean(quiz?.paused_at)
  const teamCount = quiz?.settings?.team_mode ? quiz.settings.team_count || 2 : 0
  const showStreaks = quiz?.settings?.streaks !== false
  const cardsOn = quiz?.settings?.cards !== false
  const visualsOn = quiz?.settings?.visual_effects !== false

  useEffect(() => {
    if (players.length > 0 && !me) onKicked()
  }, [players, me, onKicked])

  useEffect(() => {
    if (status === 'lobby' || status === 'live') startMusic()
    else stopMusic()
    return stopMusic
  }, [status])

  useEffect(() => {
    if (status === 'live') sfx.start()
    if (status === 'finished') sfx.fanfare()
  }, [status])

  // Load my answer for the current question (also restores state after a refresh / at reveal).
  useEffect(() => {
    if (!qid) return
    let cancelled = false
    supabase
      .rpc('get_my_answer', { p_question: qid })
      .then(({ data }) => {
        if (!cancelled) setMyAnswer(data)
      })
    return () => {
      cancelled = true
      setSubmitError(null)
    }
  }, [qid])

  const loadCards = useCallback(async () => {
    if (!qid || !cardsOn) return
    const { data } = await supabase.rpc('get_my_cards', { p_question: qid })
    setCards(data)
  }, [qid, cardsOn])

  useEffect(() => {
    setCards(null)
    setCardNote(null)
    loadCards()
  }, [loadCards, phase])

  // Effects are pushed over realtime (RLS lets a target read only effects aimed at them); the poll is a safety net.
  useEffect(() => {
    if (!cardsOn || status !== 'live') return
    const ch = supabase
      .channel(`fx-${quizId}`)
      .on('postgres_changes', { schema: 'public', event: '*', table: 'card_effects', filter: `quiz_id=eq.${quizId}` }, loadCards)
      .subscribe()
    const poll = setInterval(loadCards, 4000)
    return () => {
      clearInterval(poll)
      supabase.removeChannel(ch)
    }
  }, [cardsOn, status, quizId, loadCards])

  useEffect(() => {
    if (!cardsOn || phase !== 'question') return
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [cardsOn, phase, qid])

  useEffect(() => {
    for (const e of cards?.effects ?? []) {
      if (e.from && !seenFx.current.has(e.id)) {
        seenFx.current.add(e.id)
        // Only animate fresh effects, not ones replayed after a refresh.
        if (Date.now() + offset - new Date(e.since).getTime() < 5000) {
          setCast({ kind: e.kind, mode: e.blocked ? 'blocked' : 'hit', from: e.from })
          if (e.blocked) sfx.reveal()
          else sfx.wrong()
        }
      }
    }
  }, [cards, offset])

  useEffect(() => {
    if (phase !== 'reveal' || status !== 'live') return
    let cancelled = false
    Promise.all([
      supabase.rpc('get_reveal', { p_quiz: quizId }),
      supabase.rpc('get_my_answer', { p_question: qid }),
    ]).then(([key, mine]) => {
      if (cancelled) return
      setAnswerKey(key.data)
      setMyAnswer(mine.data)
      sfx.reveal()
      if (!mine.data?.skipped) setTimeout(() => (mine.data?.is_correct ? sfx.correct : sfx.wrong)(), 350)
    })
    return () => {
      cancelled = true
      setAnswerKey(null)
    }
  }, [phase, status, qid, quizId])

  const thaw = async () => {
    sfx.click()
    await supabase.rpc('thaw_freeze', { p_quiz: quizId })
    loadCards()
  }

  const playCard = async (kind, target) => {
    setSubmitError(null)
    const { data, error } = await supabase.rpc('play_card', { p_quiz: quizId, p_kind: kind, p_target: target ?? null })
    if (error) return setSubmitError(friendlyError(error))
    sfx.reveal()
    setCast({ kind, mode: data.blocked ? 'blocked' : 'play', target: data.self ? null : data.target })
    if (kind === 'osiris') {
      const { data: mine } = await supabase.rpc('get_my_answer', { p_question: qid })
      setMyAnswer(mine)
    }
    setCardNote(
      data.self
        ? `${CARDS[kind].name} activated!`
        : data.blocked
          ? `Blocked! ${data.target} was protected by an immunity card.`
          : `${CARDS[kind].name} hit ${data.target}!`,
    )
    loadCards()
  }

  const submit = async (answer) => {
    setSubmitError(null)
    const { error } = await supabase.rpc('submit_answer', { p_quiz: quizId, p_answer: answer })
    if (error) return setSubmitError(friendlyError(error))
    setMyAnswer({ answer, question_id: qid })
  }

  const showPin = async () => {
    if (pinShown) return setPinShown(null)
    const { data } = await supabase.rpc('get_my_pin', { p_quiz: quizId })
    setPinShown(data)
  }

  if (!quiz) return <div className="game-page center-page"><p className="blink">LOADING…</p></div>

  const guard = warning && (
    <div className="cheat-warning pop-in" role="alert" onClick={dismiss}>
      ⚠ {warning} <span className="muted">(tap to dismiss)</span>
    </div>
  )

  const header = (
    <header className="hud">
      <span className="hud-name">
        ᚹ {player.name}
        {teamCount > 0 && me?.team != null && (
          <span className="team-tag" style={{ color: teamOf(me.team).color }}> [{teamOf(me.team).name}]</span>
        )}
      </span>
      {showStreaks && (me?.streak ?? 0) >= 2 && <span className="streak">🔥{me.streak}</span>}
      <span>SCORE <b className="pop" key={me?.score}>{me?.score ?? 0}</b></span>
      <button type="button" className="mute-btn" onClick={showPin} title="Rejoin PIN" aria-label="Show rejoin PIN">
        {pinShown ? pinShown : '🔑'}
      </button>
      <MuteButton />
    </header>
  )

  if (status === 'draft')
    return (
      <div className="game-page center-page">
        <div className="pixel-box"><h2>Lobby closed</h2><p>The host closed this quiz. Hang tight!</p></div>
      </div>
    )

  if (status === 'lobby')
    return (
      <div className="game-page">
        {header}
        <div className="center-page">
          <div className="pixel-box lobby pop-in">
            <h2>{quiz.title}</h2>
            <p className="blink">THE HOST SUMMONS THE BATTLE…</p>
            <p>You're in as <b>{player.name}</b></p>
            <div className="chips">
              {players.map((p, i) => (
                <span key={p.id} className="chip pop-in" style={{ animationDelay: `${Math.min(i, 20) * 40}ms` }}>{p.name}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    )

  if (status === 'finished') {
    const place = [...players].sort((a, b) => b.score - a.score).findIndex((p) => p.id === player.id) + 1
    return (
      <div className="game-page">
        {header}
        <div className="stage">
          <div className="stage-main">
            <h2 className="logo small glitch">RAGNAROK ENDS</h2>
            <Podium players={players} />
            <p className="center-text">You placed <b>#{place}</b> with {me?.score ?? 0} pts</p>
            <Link className="btn" to="/">FIGHT AGAIN</Link>
          </div>
          <Leaderboard players={players} meId={player.id} teamCount={teamCount} />
        </div>
      </div>
    )
  }

  const expired = expiredFor === qid
  const clock = now + offset
  const activeFx = (cards?.effects ?? []).filter((e) => !e.blocked && (!e.until || new Date(e.until).getTime() > clock))
  const fxOf = (st) => activeFx.find((e) => e.status === st)
  const recentBlocks = (cards?.effects ?? []).filter((e) => e.blocked && clock - new Date(e.since).getTime() < 6000)
  const lockFx = fxOf('silence') || fxOf('freeze')
  const lockMsg = lockFx ? `${STATUS[lockFx.status].icon} ${STATUS[lockFx.status].label} — you cannot answer!` : null
  const hot = fxOf('burn')?.data?.hot ?? []
  const slowed = Boolean(fxOf('slow'))
  const jumble = visualsOn ? { prompt: Boolean(fxOf('stun')), options: Boolean(fxOf('confusion')) } : {}
  const blinded = visualsOn && Boolean(fxOf('darkness')) && phase === 'question' && !myAnswer
  const blurred = visualsOn && Boolean(fxOf('blur'))
  return (
    <div className="game-page no-select">
      {guard}
      {header}
      <CardCast cast={cast} onDone={() => setCast(null)} />
      {blinded && <div className="blackout" role="status">🌑 BLINDED BY DARKNESS…</div>}
      <div className="stage">
        <div className="stage-main">
          {q ? (
            <>
              <div className="progress">Q {quiz.current_index + 1} / {quiz.question_count}</div>
              <Timer
                key={qid}
                startedAt={quiz.question_started_at}
                limit={q.time_limit * (slowed ? 0.7 : 1)}
                offset={offset}
                running={phase === 'question'}
                pausedAt={quiz.paused_at}
                onExpire={() => setExpiredFor(qid)}
              />
              <QuestionBoard
                key={qid}
                question={q}
                phase={phase}
                answerKey={answerKey}
                myAnswer={myAnswer}
                onSubmit={expired || paused ? null : submit}
                hidden={fxOf('fifty')?.data?.hidden ?? []}
                hot={hot}
                lockMsg={phase === 'question' ? lockMsg : null}
                jumble={jumble}
                blur={blurred}
              >
                {phase === 'question' && fxOf('freeze') && !myAnswer && (
                  <button type="button" className="btn big thaw" onClick={thaw}>❄ TAP TAP TAP TO THAW!</button>
                )}
                {phase === 'question' && (activeFx.length > 0 || recentBlocks.length > 0) && (
                  <div className="fx-chips">
                    {activeFx.map((e) => (
                      <span key={e.id} className="fx-chip">
                        {STATUS[e.status]?.icon} {STATUS[e.status]?.label}
                        {e.from ? ` · ${e.from}` : ''}
                      </span>
                    ))}
                    {recentBlocks.map((e) => (
                      <span key={e.id} className="fx-chip good">🛡 Blocked {STATUS[e.status]?.label?.toLowerCase()} from {e.from}</span>
                    ))}
                  </div>
                )}
                {paused && phase === 'question' && <p className="pause-banner blink">⏸ GAME PAUSED</p>}
                {cardsOn && cards && (
                  <CardHand
                    hand={cards.hand}
                    played={cards.played}
                    disabled={phase !== 'question' || paused || expired}
                    visualsOn={visualsOn}
                    questionType={q.type}
                    players={players}
                    me={me}
                    teamMode={Boolean(quiz.settings?.team_mode)}
                    onPlay={playCard}
                  />
                )}
                {cardNote && <p className="muted pop-in">{cardNote}</p>}
                {phase === 'question' && myAnswer && <p className="blink">{myAnswer.skipped ? 'SKIPPED — WAITING…' : 'ANSWER LOCKED — WAITING…'}</p>}
                {phase === 'question' && !myAnswer && expired && <p className="error-text">TIME'S UP!</p>}
                {submitError && <p className="error-text">{submitError}</p>}
                {phase === 'reveal' && (
                  <div className={`result pop-in ${myAnswer?.is_correct ? 'good' : 'bad'}`}>
                    {myAnswer?.skipped
                      ? '↷ SKIPPED'
                      : myAnswer
                        ? myAnswer.is_correct
                          ? `✔ CORRECT! +${myAnswer.points}${myAnswer.bonus ? ` (+${myAnswer.bonus} streak)` : ''}`
                          : '✘ WRONG'
                        : '… NO ANSWER'}
                  </div>
                )}
              </QuestionBoard>
            </>
          ) : (
            <p className="blink">LOADING QUESTION…</p>
          )}
        </div>
        {quiz.settings?.show_leaderboard !== false && (
          <Leaderboard players={players} meId={player.id} teamCount={teamCount} showStreaks={showStreaks} />
        )}
      </div>
    </div>
  )
}
