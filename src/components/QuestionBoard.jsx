import { useEffect, useState } from 'react'
import { sfx } from '../lib/sound'
import { scramble } from '../lib/cards'

const SHAPES = ['ᚠ', 'ᚦ', 'ᚱ', 'ᚲ', 'ᛉ', 'ᛏ']

// Renders a question. `onSubmit` is null for the host's read-only view.
// `answerKey` is only passed during the reveal phase.
export default function QuestionBoard({ question: q, phase, answerKey, myAnswer, onSubmit, hidden = [], hot = [], lockMsg = null, jumble = {}, blur = false, children }) {
  const [picked, setPicked] = useState([])
  const [order, setOrder] = useState(() => q.options.map((o) => o.id))
  const [pairs, setPairs] = useState({})
  const [pin, setPin] = useState(null)
  const [note, setNote] = useState(null)
  useEffect(() => {
    if (!note) return
    const t = setTimeout(() => setNote(null), 1800)
    return () => clearTimeout(t)
  }, [note])
  const [text, setText] = useState('')
  const revealed = phase === 'reveal'
  const locked = revealed || Boolean(myAnswer) || !onSubmit || Boolean(lockMsg)
  const chosen = myAnswer?.answer?.selected ?? picked
  const choice = ['single', 'multiple', 'true_false'].includes(q.type)
  const correctIds = answerKey?.correct ?? []

  const submit = (answer) => {
    sfx.click()
    onSubmit(answer)
  }

  const pick = (id) => {
    if (locked) return
    if (hot.includes(id)) {
      sfx.wrong()
      return setNote("It's too hot to touch!")
    }
    sfx.select()
    if (q.type === 'multiple') setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
    else {
      setPicked([id])
      submit({ selected: [id] })
    }
  }

  return (
    <div className={`qboard ${blur ? 'blurred' : ''}`}>
      <h2 className="q-prompt pop-in">{jumble.prompt ? scramble(q.prompt, q.id) : q.prompt}</h2>
      {lockMsg && <p className="status-banner">{lockMsg}</p>}
      {note && <p className="error-text pop-in">{note}</p>}
      {q.image_url && q.type !== 'pin' && <img className="q-img pop-in" src={q.image_url} alt="" decoding="async" />}
      {q.type === 'multiple' && <p className="muted">Select all that apply</p>}

      {choice && (
        <div className={`opts n${q.options.length}`}>
          {q.options.map((o, i) => {
            if (hidden.includes(o.id)) return <div key={o.id} className={`opt gone c${i % 6}`} aria-hidden />
            const isPicked = chosen.includes(o.id)
            const cls = [
              'opt',
              `c${i % 6}`,
              isPicked && 'picked',
              hot.includes(o.id) && 'hot',
              revealed && correctIds.includes(o.id) && 'correct',
              revealed && isPicked && !correctIds.includes(o.id) && 'wrong',
              revealed && !correctIds.includes(o.id) && 'dim',
            ]
              .filter(Boolean)
              .join(' ')
            return (
              <button
                key={o.id}
                type="button"
                className={cls}
                style={{ animationDelay: `${i * 70}ms` }}
                disabled={locked && !isPicked}
                onClick={() => pick(o.id)}
              >
                <span className="shape">{SHAPES[i % 6]}</span>
                {o.image_url && <img src={o.image_url} alt="" loading="lazy" decoding="async" />}
                <span>{jumble.options ? scramble(o.text, o.id) : o.text}</span>
              </button>
            )
          })}
        </div>
      )}

      {q.type === 'multiple' && onSubmit && !locked && (
        <button className="btn big" disabled={!picked.length} onClick={() => submit({ selected: picked })}>
          LOCK IN
        </button>
      )}

      {q.type === 'ordering' && (() => {
        const shown = myAnswer?.answer?.order ?? (revealed && answerKey?.order) ?? order
        const byId = Object.fromEntries(q.options.map((o) => [o.id, o]))
        const move = (i, d) => {
          sfx.select()
          setOrder((arr) => {
            const next = [...arr]
            ;[next[i], next[i + d]] = [next[i + d], next[i]]
            return next
          })
        }
        return (
          <>
            <p className="muted">{revealed ? 'Correct order' : 'Put these in the right order'}</p>
            <ol className="order-list">
              {shown.map((id, i) => (
                <li key={id} className="order-item pop-in">
                  <span className="order-n">{i + 1}</span>
                  <span className="order-text">{byId[id]?.text}</span>
                  {!locked && (
                    <span className="order-btns">
                      <button type="button" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">▲</button>
                      <button type="button" disabled={i === shown.length - 1} onClick={() => move(i, 1)} aria-label="Move down">▼</button>
                    </span>
                  )}
                </li>
              ))}
            </ol>
            {onSubmit && !locked && (
              <button className="btn big" onClick={() => submit({ order })}>LOCK IN</button>
            )}
          </>
        )
      })()}

      {q.type === 'matching' && (() => {
        const rights = q.extra ?? []
        const shown = myAnswer?.answer?.pairs ?? (revealed && answerKey?.pairs) ?? pairs
        const rText = Object.fromEntries(rights.map((r) => [r.id, r.text]))
        const done = q.options.every((o) => pairs[o.id])
        return (
          <>
            <p className="muted">{revealed ? 'Correct pairs' : 'Match each item'}</p>
            <ul className="match-list">
              {q.options.map((o) => (
                <li key={o.id} className="match-row pop-in">
                  <span className="match-left">{o.text}</span>
                  <span className="match-arrow">→</span>
                  {locked ? (
                    <span className="match-right">{rText[shown[o.id]] ?? '—'}</span>
                  ) : (
                    <select
                      className="input"
                      value={pairs[o.id] ?? ''}
                      onChange={(e) => {
                        sfx.select()
                        setPairs((p) => ({ ...p, [o.id]: e.target.value }))
                      }}
                    >
                      <option value="">Choose…</option>
                      {rights.map((r) => (
                        <option key={r.id} value={r.id}>{r.text}</option>
                      ))}
                    </select>
                  )}
                </li>
              ))}
            </ul>
            {onSubmit && !locked && (
              <button className="btn big" disabled={!done} onClick={() => submit({ pairs })}>LOCK IN</button>
            )}
          </>
        )
      })()}

      {q.type === 'pin' && (() => {
        const mine = myAnswer?.answer?.x != null ? myAnswer.answer : pin
        const place = (e) => {
          if (locked) return
          const r = e.currentTarget.getBoundingClientRect()
          sfx.select()
          setPin({
            x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
            y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
          })
        }
        return (
          <>
            <p className="muted">{revealed ? 'The green circle was the target' : 'Tap the image to drop your pin'}</p>
            <div className={`pin-wrap ${locked ? '' : 'live'}`} onClick={place}>
              <img src={q.image_url} alt="" decoding="async" draggable={false} />
              {revealed && answerKey?.radius != null && (
                <span
                  className="pin-target"
                  style={{
                    left: `${answerKey.x * 100}%`,
                    top: `${answerKey.y * 100}%`,
                    width: `${answerKey.radius * 200}%`,
                  }}
                />
              )}
              {mine && <span className="pin-mark" style={{ left: `${mine.x * 100}%`, top: `${mine.y * 100}%` }}>📍</span>}
            </div>
            {onSubmit && !locked && (
              <button className="btn big" disabled={!pin} onClick={() => submit(pin)}>LOCK IN</button>
            )}
          </>
        )
      })()}

      {(q.type === 'text' || q.type === 'number') && onSubmit && !locked && (
        <form
          className="answer-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (text.trim() === '') return
            submit(q.type === 'number' ? { number: Number(text) } : { text })
          }}
        >
          <input
            className="input"
            autoFocus
            type={q.type === 'number' ? 'number' : 'text'}
            step="any"
            placeholder={q.type === 'number' ? 'Type a number…' : 'Type your answer…'}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button className="btn big">SEND</button>
        </form>
      )}

      {(q.type === 'text' || q.type === 'number') && myAnswer && !revealed && (
        <p className="you-said">
          You answered: <b>{myAnswer.answer.text ?? myAnswer.answer.number}</b>
        </p>
      )}

      {revealed && answerKey && (q.type === 'text' || q.type === 'number') && (
        <p className="you-said pop-in">
          Answer: <b>{q.type === 'text' ? answerKey.accepted?.join(' / ') : `${answerKey.value}${answerKey.tolerance ? ` (±${answerKey.tolerance})` : ''}`}</b>
        </p>
      )}
      {children}
    </div>
  )
}
