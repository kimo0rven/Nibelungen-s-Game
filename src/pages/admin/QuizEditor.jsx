import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { supabase, friendlyError } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { optimizeImage } from '../../lib/optimizeImage'

const TYPES = {
  single: 'Multiple choice (one answer)',
  multiple: 'Multiple choice (several answers)',
  true_false: 'True / False',
  text: 'Type the answer',
  number: 'Number',
  ordering: 'Put in order',
  matching: 'Match pairs',
  pin: 'Pin on image',
}
const CHOICE = ['single', 'multiple', 'true_false']
const LISTY = ['ordering', 'matching']

const DEFAULT_SETTINGS = {
  allow_late_join: true,
  show_leaderboard: true,
  streaks: true,
  cards: true,
  visual_effects: true,
  allow_spectators: true,
  team_mode: false,
  team_count: 2,
  auto_advance: false,
  reveal_seconds: 6,
}

// Shuffle that never returns the original order (so the answer isn't given away).
function shuffleNotSame(arr) {
  if (arr.length < 2) return [...arr]
  for (let t = 0; t < 20; t++) {
    const c = [...arr]
    for (let i = c.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[c[i], c[j]] = [c[j], c[i]]
    }
    if (c.some((x, i) => x !== arr[i])) return c
  }
  return [...arr.slice(1), arr[0]]
}

const rid = () => Math.random().toString(36).slice(2, 8)
const blankOption = () => ({ id: rid(), text: '', image_url: '' })
const tfOptions = () => [
  { id: 'true', text: 'True', image_url: '' },
  { id: 'false', text: 'False', image_url: '' },
]

function newQuestion(type = 'single') {
  const options = type === 'true_false' ? tfOptions() : [blankOption(), blankOption(), blankOption(), blankOption()]
  const listy = LISTY.includes(type)
  return {
    id: crypto.randomUUID(),
    type,
    prompt: '',
    image_url: '',
    options: CHOICE.includes(type) ? options : listy ? options.slice(0, 3) : [],
    rights: type === 'matching' ? ['', '', ''] : [],
    pin: { x: 0.5, y: 0.5, radius: 0.1, aspect: 1 },
    correct: CHOICE.includes(type) ? [options[0].id] : [],
    accepted: [''],
    case_sensitive: false,
    value: 0,
    tolerance: 0,
    time_limit: 20,
    points: 1000,
  }
}

function validate(title, questions) {
  if (!title.trim()) return 'Give your quiz a title.'
  if (!questions.length) return 'Add at least one question.'
  for (const [i, q] of questions.entries()) {
    const n = `Question ${i + 1}`
    if (!q.prompt.trim()) return `${n}: add the question text.`
    if (['single', 'multiple', 'true_false'].includes(q.type)) {
      const filled = q.options.filter((o) => o.text.trim() || o.image_url)
      if (filled.length < 2) return `${n}: needs at least 2 answer options.`
      if (q.options.some((o) => !o.text.trim() && !o.image_url)) return `${n}: fill in or remove empty options.`
      if (!q.correct.length) return `${n}: mark a correct answer.`
    }
    if (LISTY.includes(q.type)) {
      if (q.options.length < 2) return `${n}: needs at least 2 items.`
      if (q.options.some((o) => !o.text.trim())) return `${n}: fill in or remove empty items.`
      if (q.type === 'matching' && q.rights.some((r) => !r.trim())) return `${n}: fill in every match.`
    }
    if (q.type === 'pin' && !q.image_url) return `${n}: upload the image players will pin.`
    if (q.type === 'text' && !q.accepted.some((a) => a.trim())) return `${n}: add an accepted answer.`
    if (q.type === 'number' && !Number.isFinite(Number(q.value))) return `${n}: enter a valid number.`
  }
  return null
}

export default function QuizEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [loading, setLoading] = useState(Boolean(id))
  const [status, setStatus] = useState('draft')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [questions, setQuestions] = useState([newQuestion()])
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!id) return
    ;(async () => {
      const [{ data: quiz }, { data: qs }] = await Promise.all([
        supabase.from('quizzes').select('*').eq('id', id).maybeSingle(),
        supabase.from('questions').select('*, question_keys(key)').eq('quiz_id', id).order('idx'),
      ])
      if (!quiz) return navigate('/admin/quizzes', { replace: true })
      setStatus(quiz.status)
      setTitle(quiz.title)
      setDescription(quiz.description)
      setSettings({ ...DEFAULT_SETTINGS, ...quiz.settings })
      setQuestions(
        qs.length
          ? qs.map((q) => {
              const key = q.question_keys?.key ?? q.question_keys?.[0]?.key ?? {}
              let options = q.options
              let rights = []
              if (q.type === 'ordering' && key.order) {
                const byId = Object.fromEntries(options.map((o) => [o.id, o]))
                options = key.order.map((oid) => byId[oid]).filter(Boolean)
              }
              if (q.type === 'matching') {
                const rText = Object.fromEntries((q.extra ?? []).map((r) => [r.id, r.text]))
                rights = options.map((o) => rText[key.pairs?.[o.id]] ?? '')
              }
              return {
                ...newQuestion(q.type),
                id: q.id,
                prompt: q.prompt,
                image_url: q.image_url ?? '',
                options,
                rights,
                pin: q.type === 'pin' ? { x: key.x ?? 0.5, y: key.y ?? 0.5, radius: key.radius ?? 0.1, aspect: key.aspect ?? 1 } : newQuestion().pin,
                correct: key.correct ?? [],
                accepted: key.accepted?.length ? key.accepted : [''],
                case_sensitive: Boolean(key.case_sensitive),
                value: key.value ?? 0,
                tolerance: key.tolerance ?? 0,
                time_limit: q.time_limit,
                points: q.points,
              }
            })
          : [newQuestion()],
      )
      setLoading(false)
    })()
  }, [id, navigate])

  const locked = status === 'lobby' || status === 'live'
  const patch = (qid, changes) => setQuestions((qs) => qs.map((q) => (q.id === qid ? { ...q, ...changes } : q)))
  const move = (i, d) =>
    setQuestions((qs) => {
      const j = i + d
      if (j < 0 || j >= qs.length) return qs
      const c = [...qs]
      ;[c[i], c[j]] = [c[j], c[i]]
      return c
    })

  const upload = async (original, compact) => {
    const file = await optimizeImage(original, { maxSize: compact ? 640 : 1280 })
    const ext = file.name.split('.').pop().toLowerCase()
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`
    const { error: err } = await supabase.storage
      .from('quiz-images')
      .upload(path, file, { cacheControl: '31536000', contentType: file.type })
    if (err) throw err
    return supabase.storage.from('quiz-images').getPublicUrl(path).data.publicUrl
  }

  const save = async () => {
    const problem = validate(title, questions)
    if (problem) return setError(problem)
    setSaving(true)
    setError(null)
    try {
      let quizId = id
      const payload = { title: title.trim(), description: description.trim(), settings }
      if (id) {
        const { error: e } = await supabase.from('quizzes').update(payload).eq('id', id)
        if (e) throw e
        if (status === 'finished') await supabase.rpc('host_advance', { p_quiz: id, p_action: 'close' })
      } else {
        const { data, error: e } = await supabase.from('quizzes').insert(payload).select('id').single()
        if (e) throw e
        quizId = data.id
      }
      const { error: delErr } = await supabase.from('questions').delete().eq('quiz_id', quizId)
      if (delErr) throw delErr
      // Right-hand items get fresh ids so the stored data never reveals the pairing.
      const matchData = new Map(
        questions
          .filter((q) => q.type === 'matching')
          .map((q) => {
            const rightItems = q.rights.map((t) => ({ id: rid(), text: t.trim() }))
            const pairs = Object.fromEntries(q.options.map((o, i) => [o.id, rightItems[i].id]))
            return [q.id, { extra: shuffleNotSame(rightItems), pairs }]
          }),
      )
      const orderData = new Map(
        questions
          .filter((q) => q.type === 'ordering')
          .map((q) => [q.id, { order: q.options.map((o) => o.id), shown: shuffleNotSame(q.options) }]),
      )
      const rows = questions.map((q, idx) => ({
        id: q.id,
        quiz_id: quizId,
        idx,
        type: q.type,
        prompt: q.prompt.trim(),
        image_url: q.image_url || null,
        options: (orderData.get(q.id)?.shown ?? q.options).map((o) => ({ id: o.id, text: o.text.trim(), image_url: LISTY.includes(q.type) ? null : o.image_url || null })),
        extra: matchData.get(q.id)?.extra ?? [],
        time_limit: Number(q.time_limit),
        points: Number(q.points),
      }))
      const { error: qErr } = await supabase.from('questions').insert(rows)
      if (qErr) throw qErr
      const keys = questions.map((q) => ({
        question_id: q.id,
        key:
          q.type === 'text'
            ? { accepted: q.accepted.map((a) => a.trim()).filter(Boolean), case_sensitive: q.case_sensitive }
            : q.type === 'number'
              ? { value: Number(q.value), tolerance: Number(q.tolerance) || 0 }
              : q.type === 'ordering'
                ? { order: orderData.get(q.id).order }
                : q.type === 'matching'
                  ? { pairs: matchData.get(q.id).pairs }
                  : q.type === 'pin'
                    ? { x: q.pin.x, y: q.pin.y, radius: q.pin.radius, aspect: q.pin.aspect }
                    : { correct: q.correct },
      }))
      const { error: kErr } = await supabase.from('question_keys').insert(keys)
      if (kErr) throw kErr
      navigate('/admin/quizzes')
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="muted">Loading…</p>

  return (
    <>
      <div className="row">
        <h1>{id ? 'Edit quiz' : 'Create quiz'}</h1>
        <button className="abtn primary" onClick={save} disabled={saving || locked}>
          {saving ? 'Saving…' : 'Save quiz'}
        </button>
      </div>
      {locked && <p className="error-text">This quiz is open or live. Close the lobby from the host screen before editing.</p>}
      {status === 'finished' && <p className="muted">Saving will clear previous results and return the quiz to draft.</p>}
      {error && <p className="error-text">{error}</p>}

      <fieldset disabled={locked} className="plain">
        <div className="card form">
          <label>Title<input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Friday trivia night" /></label>
          <label>Description<textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} /></label>
          <label className="check">
            <input type="checkbox" checked={settings.allow_late_join} onChange={(e) => setSettings({ ...settings, allow_late_join: e.target.checked })} />
            Allow players to join after the quiz has started
          </label>
          <label className="check">
            <input type="checkbox" checked={settings.show_leaderboard} onChange={(e) => setSettings({ ...settings, show_leaderboard: e.target.checked })} />
            Show live leaderboard to players
          </label>
          <label className="check">
            <input type="checkbox" checked={settings.streaks} onChange={(e) => setSettings({ ...settings, streaks: e.target.checked })} />
            Streak bonuses (+10% per correct answer in a row, up to +50%)
          </label>
          <label className="check">
            <input type="checkbox" checked={settings.cards} onChange={(e) => setSettings({ ...settings, cards: e.target.checked })} />
            Ragnarok cards (players attack, buff and block each other)
          </label>
          {settings.cards && (
            <label className="check">
              <input type="checkbox" checked={settings.visual_effects} onChange={(e) => setSettings({ ...settings, visual_effects: e.target.checked })} />
              Allow visual card effects (blur, blackout, jumbled text)
            </label>
          )}
          <label className="check">
            <input type="checkbox" checked={settings.allow_spectators} onChange={(e) => setSettings({ ...settings, allow_spectators: e.target.checked })} />
            Allow big-screen (spectator) view
          </label>
          <label className="check">
            <input type="checkbox" checked={settings.team_mode} onChange={(e) => setSettings({ ...settings, team_mode: e.target.checked })} />
            Team mode (players are auto-balanced into teams)
          </label>
          {settings.team_mode && (
            <label>Number of teams
              <select value={settings.team_count} onChange={(e) => setSettings({ ...settings, team_count: Number(e.target.value) })}>
                {[2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          )}
          <label className="check">
            <input type="checkbox" checked={settings.auto_advance} onChange={(e) => setSettings({ ...settings, auto_advance: e.target.checked })} />
            Auto-advance to the next question after the reveal
          </label>
          {settings.auto_advance && (
            <label>Reveal duration (sec)
              <input type="number" min={2} max={30} value={settings.reveal_seconds} onChange={(e) => setSettings({ ...settings, reveal_seconds: Math.min(30, Math.max(2, Number(e.target.value) || 6)) })} />
            </label>
          )}
        </div>

        {questions.map((q, i) => (
          <QuestionCard
            key={q.id}
            q={q}
            index={i}
            total={questions.length}
            patch={(c) => patch(q.id, c)}
            move={(d) => move(i, d)}
            upload={upload}
            onError={setError}
            remove={() => setQuestions((qs) => qs.filter((x) => x.id !== q.id))}
            duplicate={() =>
              setQuestions((qs) => {
                const idMap = Object.fromEntries(q.options.map((o) => [o.id, rid()]))
                const copy = {
                  ...q,
                  id: crypto.randomUUID(),
                  options: q.options.map((o) => ({ ...o, id: q.type === 'true_false' ? o.id : idMap[o.id] })),
                  correct: q.type === 'true_false' ? q.correct : q.correct.map((c) => idMap[c]),
                }
                const c = [...qs]
                c.splice(i + 1, 0, copy)
                return c
              })
            }
          />
        ))}

        <div className="add-bar">
          <span className="muted">Add question:</span>
          {Object.entries(TYPES).map(([t, label]) => (
            <button key={t} type="button" className="abtn" onClick={() => setQuestions((qs) => [...qs, newQuestion(t)])}>
              + {label}
            </button>
          ))}
        </div>
      </fieldset>
    </>
  )
}

function ImageField({ value, onChange, upload, onError, compact }) {
  const [busy, setBusy] = useState(false)
  return (
    <div className="image-field">
      {value && <img src={value} alt="" className={compact ? 'thumb sm' : 'thumb'} />}
      <label className="abtn small">
        {busy ? 'Optimizing…' : value ? 'Replace image' : compact ? '🖼' : '🖼 Add image'}
        <input
          type="file"
          accept="image/*"
          hidden
          onChange={async (e) => {
            const f = e.target.files[0]
            if (!f) return
            if (f.size > 15 * 1024 * 1024) return onError('Images must be under 15 MB.')
            setBusy(true)
            try {
              onChange(await upload(f, compact))
            } catch (err) {
              onError(friendlyError(err))
            }
            setBusy(false)
            e.target.value = ''
          }}
        />
      </label>
      {value && (
        <button type="button" className="abtn small danger" onClick={() => onChange('')}>
          ✕
        </button>
      )}
    </div>
  )
}

function QuestionCard({ q, index, total, patch, move, remove, duplicate, upload, onError }) {
  const choice = CHOICE.includes(q.type)

  const changeType = (type) => {
    const fresh = newQuestion(type)
    const reusable = q.options.length >= 2 && q.type !== 'true_false'
    if (type === 'single' || type === 'multiple') {
      const valid = q.correct.filter((c) => q.options.some((o) => o.id === c))
      const correct = valid.length ? valid : [q.options[0]?.id]
      patch({
        type,
        options: reusable ? q.options : fresh.options,
        correct: reusable ? (type === 'single' ? correct.slice(0, 1) : correct) : fresh.correct,
      })
    } else if (LISTY.includes(type)) {
      const options = reusable ? q.options : fresh.options
      patch({ type, options, rights: type === 'matching' ? options.map((_, i) => q.rights[i] ?? '') : [], correct: [] })
    } else patch({ type, options: fresh.options, correct: fresh.correct, rights: [] })
  }

  const setOption = (oid, changes) => patch({ options: q.options.map((o) => (o.id === oid ? { ...o, ...changes } : o)) })
  const toggleCorrect = (oid) => {
    if (q.type === 'multiple') patch({ correct: q.correct.includes(oid) ? q.correct.filter((c) => c !== oid) : [...q.correct, oid] })
    else patch({ correct: [oid] })
  }

  return (
    <div className="card question-card">
      <div className="row">
        <b>Question {index + 1}</b>
        <div className="actions">
          <button type="button" className="abtn small" onClick={() => move(-1)} disabled={index === 0}>↑</button>
          <button type="button" className="abtn small" onClick={() => move(1)} disabled={index === total - 1}>↓</button>
          <button type="button" className="abtn small" onClick={duplicate}>Duplicate</button>
          <button type="button" className="abtn small danger" onClick={remove} disabled={total === 1}>Delete</button>
        </div>
      </div>

      <div className="grid-2">
        <label>Type
          <select value={q.type} onChange={(e) => changeType(e.target.value)}>
            {Object.entries(TYPES).map(([t, l]) => <option key={t} value={t}>{l}</option>)}
          </select>
        </label>
        <div className="grid-2">
          <label>Time (sec)<input type="number" min={5} max={300} value={q.time_limit} onChange={(e) => patch({ time_limit: e.target.value })} /></label>
          <label>Max points<input type="number" min={0} max={10000} step={100} value={q.points} onChange={(e) => patch({ points: e.target.value })} /></label>
        </div>
      </div>

      <label>Question<textarea rows={2} value={q.prompt} onChange={(e) => patch({ prompt: e.target.value })} placeholder="What is the capital of France?" /></label>
      <ImageField value={q.image_url} onChange={(v) => patch({ image_url: v })} upload={upload} onError={onError} />

      {choice && (
        <div className="options-edit">
          <div className="muted">{q.type === 'multiple' ? 'Tick every correct answer' : 'Select the correct answer'}</div>
          {q.options.map((o, i) => (
            <div className="option-row" key={o.id}>
              <input
                type={q.type === 'multiple' ? 'checkbox' : 'radio'}
                name={`correct-${q.id}`}
                checked={q.correct.includes(o.id)}
                onChange={() => toggleCorrect(o.id)}
                aria-label={`Option ${i + 1} is correct`}
              />
              <input
                className="grow"
                value={o.text}
                readOnly={q.type === 'true_false'}
                placeholder={`Option ${i + 1}`}
                onChange={(e) => setOption(o.id, { text: e.target.value })}
              />
              {q.type !== 'true_false' && (
                <>
                  <ImageField compact value={o.image_url} onChange={(v) => setOption(o.id, { image_url: v })} upload={upload} onError={onError} />
                  <button
                    type="button"
                    className="abtn small danger"
                    disabled={q.options.length <= 2}
                    onClick={() => patch({ options: q.options.filter((x) => x.id !== o.id), correct: q.correct.filter((c) => c !== o.id) })}
                  >✕</button>
                </>
              )}
            </div>
          ))}
          {q.type !== 'true_false' && q.options.length < 6 && (
            <button type="button" className="abtn small" onClick={() => patch({ options: [...q.options, blankOption()] })}>+ Add option</button>
          )}
        </div>
      )}

      {LISTY.includes(q.type) && (
        <div className="options-edit">
          <div className="muted">
            {q.type === 'ordering'
              ? 'Enter the items in the CORRECT order — players will see them shuffled.'
              : 'Each row is a correct pair. Players will see the right-hand side shuffled.'}
          </div>
          {q.options.map((o, i) => (
            <div className="option-row" key={o.id}>
              <span className="muted">{i + 1}.</span>
              <input className="grow" value={o.text} placeholder={q.type === 'ordering' ? `Step ${i + 1}` : `Item ${i + 1}`} onChange={(e) => setOption(o.id, { text: e.target.value })} />
              {q.type === 'matching' && (
                <>
                  <span>→</span>
                  <input className="grow" value={q.rights[i] ?? ''} placeholder={`Match ${i + 1}`} onChange={(e) => patch({ rights: q.rights.map((r, j) => (j === i ? e.target.value : r)) })} />
                </>
              )}
              <button
                type="button"
                className="abtn small danger"
                disabled={q.options.length <= 2}
                onClick={() => patch({ options: q.options.filter((x) => x.id !== o.id), rights: q.rights.filter((_, j) => j !== i) })}
              >✕</button>
            </div>
          ))}
          {q.options.length < 8 && (
            <button type="button" className="abtn small" onClick={() => patch({ options: [...q.options, blankOption()], rights: q.type === 'matching' ? [...q.rights, ''] : [] })}>+ Add {q.type === 'ordering' ? 'item' : 'pair'}</button>
          )}
        </div>
      )}

      {q.type === 'pin' && (
        <div className="options-edit">
          {!q.image_url ? (
            <p className="muted">Upload the image above, then click it to set the target.</p>
          ) : (
            <>
              <p className="muted">Click the image to place the target. Players within the circle are correct.</p>
              <div
                className="pin-wrap live"
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect()
                  patch({ pin: { ...q.pin, x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) } })
                }}
              >
                <img
                  src={q.image_url}
                  alt=""
                  draggable={false}
                  onLoad={(e) => {
                    const aspect = e.currentTarget.naturalWidth / e.currentTarget.naturalHeight
                    if (aspect && aspect !== q.pin.aspect) patch({ pin: { ...q.pin, aspect } })
                  }}
                />
                <span className="pin-target" style={{ left: `${q.pin.x * 100}%`, top: `${q.pin.y * 100}%`, width: `${q.pin.radius * 200}%` }} />
              </div>
              <label>Tolerance radius ({Math.round(q.pin.radius * 100)}% of image width)
                <input type="range" min={0.02} max={0.4} step={0.01} value={q.pin.radius} onChange={(e) => patch({ pin: { ...q.pin, radius: Number(e.target.value) } })} />
              </label>
            </>
          )}
        </div>
      )}

      {q.type === 'text' && (
        <div className="options-edit">
          <div className="muted">Accepted answers (any of these is correct)</div>
          {q.accepted.map((a, i) => (
            <div className="option-row" key={i}>
              <input className="grow" value={a} placeholder="Paris" onChange={(e) => patch({ accepted: q.accepted.map((x, j) => (j === i ? e.target.value : x)) })} />
              <button type="button" className="abtn small danger" disabled={q.accepted.length === 1} onClick={() => patch({ accepted: q.accepted.filter((_, j) => j !== i) })}>✕</button>
            </div>
          ))}
          <button type="button" className="abtn small" onClick={() => patch({ accepted: [...q.accepted, ''] })}>+ Add accepted answer</button>
          <label className="check"><input type="checkbox" checked={q.case_sensitive} onChange={(e) => patch({ case_sensitive: e.target.checked })} /> Case sensitive</label>
        </div>
      )}

      {q.type === 'number' && (
        <div className="grid-2">
          <label>Correct number<input type="number" step="any" value={q.value} onChange={(e) => patch({ value: e.target.value })} /></label>
          <label>Tolerance (±)<input type="number" step="any" min={0} value={q.tolerance} onChange={(e) => patch({ tolerance: e.target.value })} /></label>
        </div>
      )}
    </div>
  )
}
