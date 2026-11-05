import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { supabase } from '../../lib/supabase'
import { StatusBadge } from './statusBadge'

export default function Dashboard() {
  const [quizzes, setQuizzes] = useState(null)
  const [stats, setStats] = useState({ players: 0, questions: 0 })

  useEffect(() => {
    ;(async () => {
      const [{ data }, p, q] = await Promise.all([
        supabase.from('quizzes').select('*').order('created_at', { ascending: false }),
        supabase.from('players').select('*', { count: 'exact', head: true }),
        supabase.from('questions').select('*', { count: 'exact', head: true }),
      ])
      setQuizzes(data ?? [])
      setStats({ players: p.count ?? 0, questions: q.count ?? 0 })
    })()
  }, [])

  if (!quizzes) return <p className="muted">Loading…</p>
  const live = quizzes.filter((q) => q.status === 'live' || q.status === 'lobby')

  return (
    <>
      <h1>Dashboard</h1>
      <div className="stat-grid">
        <Stat label="Quizzes" value={quizzes.length} />
        <Stat label="Live / open now" value={live.length} accent />
        <Stat label="Questions" value={stats.questions} />
        <Stat label="Players joined" value={stats.players} />
      </div>

      {live.length > 0 && (
        <section>
          <h2>Happening now</h2>
          {live.map((q) => (
            <div className="card row" key={q.id}>
              <div><b>{q.title}</b> <StatusBadge status={q.status} /></div>
              <Link className="abtn primary" to={`/admin/quizzes/${q.id}/host`}>Open host screen</Link>
            </div>
          ))}
        </section>
      )}

      <section>
        <div className="row">
          <h2>Recent quizzes</h2>
          <Link className="abtn primary" to="/admin/quizzes/new">+ New quiz</Link>
        </div>
        {quizzes.length === 0 && <p className="muted">No quizzes yet — create your first one!</p>}
        {quizzes.slice(0, 5).map((q) => (
          <div className="card row" key={q.id}>
            <div><b>{q.title}</b> <StatusBadge status={q.status} /></div>
            <Link className="abtn" to={`/admin/quizzes/${q.id}/host`}>Host</Link>
          </div>
        ))}
      </section>
    </>
  )
}

function Stat({ label, value, accent }) {
  return (
    <div className={`card stat ${accent ? 'accent' : ''}`}>
      <div className="stat-value">{value}</div>
      <div className="muted">{label}</div>
    </div>
  )
}
