import { useState } from 'react'
import { Navigate, NavLink, Outlet, useNavigate } from 'react-router'
import { useAuth } from '../../context/AuthContext'

const LINKS = [
  { to: '/admin', label: 'Dashboard', icon: '▦', end: true },
  { to: '/admin/quizzes', label: 'My Quizzes', icon: '☰', end: true },
  { to: '/admin/cards', label: 'Card Library', icon: '🂠', end: true },
  { to: '/admin/quizzes/new', label: 'Create Quiz', icon: '＋', end: true },
]

export default function AdminLayout() {
  const { isHost, loading, user, signOut } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  if (loading) return <div className="admin center-fill">Loading…</div>
  if (!isHost) return <Navigate to="/admin/login" replace />

  return (
    <div className="admin shell">
      <button className="burger" onClick={() => setOpen(!open)} aria-label="Toggle menu">☰</button>
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">ᛟ RAGNAROK QUIZ</div>
        <nav onClick={() => setOpen(false)}>
          {LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <span className="nav-icon">{l.icon}</span> {l.label}
            </NavLink>
          ))}
          <NavLink to="/" className="nav-link"><span className="nav-icon">▶</span> Player page</NavLink>
        </nav>
        <div className="sidebar-foot">
          <div className="muted ellipsis" title={user.email}>{user.email}</div>
          <button
            className="abtn"
            onClick={async () => {
              await signOut()
              navigate('/admin/login')
            }}
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}
