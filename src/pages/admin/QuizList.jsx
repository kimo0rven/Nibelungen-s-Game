import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { supabase } from '../../lib/supabase'
import { StatusBadge } from './statusBadge'

export default function QuizList() {
  const [quizzes, setQuizzes] = useState(null)

  const load = async () => {
    const { data } = await supabase.from('quizzes').select('*').order('created_at', { ascending: false })
    setQuizzes(data ?? [])
  }
  useEffect(() => {
    load()
  }, [])

  const remove = async (q) => {
    if (!confirm(`Delete "${q.title}" and all its questions and results?`)) return
    await supabase.from('quizzes').delete().eq('id', q.id)
    load()
  }

  if (!quizzes) return <p className="muted">Loading…</p>
  return (
    <>
      <div className="row">
        <h1>My Quizzes</h1>
        <Link className="abtn primary" to="/admin/quizzes/new">+ New quiz</Link>
      </div>
      {quizzes.length === 0 && <p className="muted">Nothing here yet.</p>}
      {quizzes.map((q) => (
        <div className="card row wrap" key={q.id}>
          <div>
            <b>{q.title}</b> <StatusBadge status={q.status} />
            <div className="muted">Code <code>{q.join_code}</code> · {q.description || 'No description'}</div>
          </div>
          <div className="actions">
            <Link className="abtn" to={`/admin/quizzes/${q.id}/edit`}>Edit</Link>
            <Link className="abtn primary" to={`/admin/quizzes/${q.id}/host`}>Host</Link>
            <button className="abtn danger" onClick={() => remove(q)}>Delete</button>
          </div>
        </div>
      ))}
    </>
  )
}
