import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

// Shared realtime state for a quiz. Hosts also get answers + answer keys; players get the
// questions the server lets them see (RLS reveals only up to the current question).
export function useLiveQuiz(quizId, { isHost = false } = {}) {
  const [quiz, setQuiz] = useState(null)
  const [players, setPlayers] = useState([])
  const [questions, setQuestions] = useState([])
  const [answers, setAnswers] = useState([])
  const [offset, setOffset] = useState(0)
  const [error, setError] = useState(null)
  const debounce = useRef({})

  const loadQuiz = useCallback(async () => {
    const { data, error: e } = await supabase.from('quizzes').select('*').eq('id', quizId).maybeSingle()
    if (e) setError(e)
    else setQuiz(data)
  }, [quizId])

  const loadPlayers = useCallback(async () => {
    const { data } = await supabase.from('players').select('*').eq('quiz_id', quizId)
    if (data) setPlayers(data)
  }, [quizId])

  const loadAnswers = useCallback(async () => {
    const { data } = await supabase.from('answers').select('*').eq('quiz_id', quizId)
    if (data) setAnswers(data)
  }, [quizId])

  const loadQuestions = useCallback(async () => {
    const { data } = await supabase.from('questions').select('*').eq('quiz_id', quizId).order('idx')
    if (data) setQuestions(data)
  }, [quizId])

  useEffect(() => {
    const later = (name, fn) => {
      clearTimeout(debounce.current[name])
      debounce.current[name] = setTimeout(fn, 150)
    }
    const timers = debounce.current

    const t0 = Date.now()
    supabase.rpc('server_time').then(({ data }) => {
      if (data) setOffset(new Date(data).getTime() - (t0 + Date.now()) / 2)
    })
    loadQuiz()
    loadPlayers()
    if (isHost) {
      loadAnswers()
      loadQuestions()
    }

    const filter = { schema: 'public', event: '*' }
    let channel = supabase
      .channel(`quiz-${quizId}`)
      .on('postgres_changes', { ...filter, table: 'quizzes', filter: `id=eq.${quizId}` }, (p) => {
        if (p.new?.id) setQuiz(p.new)
      })
      .on('postgres_changes', { ...filter, table: 'players', filter: `quiz_id=eq.${quizId}` }, () =>
        later('players', loadPlayers),
      )
    if (isHost) {
      channel = channel.on('postgres_changes', { ...filter, table: 'answers', filter: `quiz_id=eq.${quizId}` }, () =>
        later('answers', loadAnswers),
      )
    }
    channel.subscribe()

    // Safety net in case a realtime message is dropped.
    const poll = setInterval(() => {
      loadQuiz()
      loadPlayers()
      if (isHost) loadAnswers()
    }, 6000)

    return () => {
      clearInterval(poll)
      Object.values(timers).forEach(clearTimeout)
      supabase.removeChannel(channel)
    }
  }, [quizId, isHost, loadQuiz, loadPlayers, loadAnswers, loadQuestions])

  // Players: refetch visible questions whenever the quiz moves forward.
  const idx = quiz?.current_index
  const status = quiz?.status
  useEffect(() => {
    if (!isHost && status && status !== 'lobby' && status !== 'draft') loadQuestions()
  }, [isHost, idx, status, loadQuestions])

  return { quiz, setQuiz, players, questions, answers, offset, error, reloadQuestions: loadQuestions, reloadQuiz: loadQuiz }
}
