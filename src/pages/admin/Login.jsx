import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { useAuth } from '../../context/AuthContext'
import { isConfigured } from '../../lib/supabase'

export default function Login() {
  const { isHost, loading, user, signIn, signOut } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  if (!loading && isHost) return <Navigate to="/admin" replace />

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error: err } = await signIn(email, password)
    setBusy(false)
    if (err) return setError(err.message)
    navigate('/admin')
  }

  return (
    <div className="admin login-page">
      <form className="card login-card pop-in" onSubmit={submit}>
        <h1 className="logo small">RAGNAROK</h1>
        <p className="muted">Host dashboard</p>
        {!isConfigured && <p className="error-text">Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY first.</p>}
        <label>
          Email
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Password
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p className="error-text">{error}</p>}
        {!loading && user && !user.is_anonymous && !isHost && (
          <p className="error-text">
            This account is not authorised to host.{' '}
            <button type="button" className="link-btn" onClick={signOut}>Sign out</button>
          </p>
        )}
        <button className="abtn primary" disabled={busy}>
          {busy ? '…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
