/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [sessionReady, setSessionReady] = useState(false)
  const [allowedFor, setAllowedFor] = useState(null) // { userId, ok }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setSessionReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  // Only allowlisted (non-anonymous) accounts count as hosts.
  const userId = session?.user?.id
  const anon = session?.user?.is_anonymous
  useEffect(() => {
    if (!userId || anon) return
    let cancelled = false
    supabase
      .from('hosts')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setAllowedFor({ userId, ok: Boolean(data) })
      })
    return () => {
      cancelled = true
    }
  }, [userId, anon])

  const checking = Boolean(userId && !anon && allowedFor?.userId !== userId)
  const loading = !sessionReady || checking
  const allowed = Boolean(userId && !anon && allowedFor?.userId === userId && allowedFor.ok)

  const value = useMemo(() => {
    const user = session?.user ?? null
    return {
      session,
      user,
      loading,
      isHost: allowed,
      signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
      signOut: () => supabase.auth.signOut(),
      // Players get a persistent anonymous identity: the same browser keeps the same user id,
      // which lets the server detect duplicate joins and restore seats on refresh.
      async ensurePlayer() {
        const { data } = await supabase.auth.getSession()
        if (data.session) return data.session.user
        const { data: anon, error } = await supabase.auth.signInAnonymously()
        if (error) throw error
        return anon.user
      },
    }
  }, [session, loading, allowed])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
