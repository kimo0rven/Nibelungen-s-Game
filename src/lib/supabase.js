import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isConfigured = Boolean(url && key)

export const supabase = createClient(url || 'http://localhost', key || 'missing', {
  auth: { persistSession: true, autoRefreshToken: true },
})

const ERRORS = {
  quiz_not_found: 'No quiz found with that code.',
  not_open: 'This quiz is not open yet.',
  finished: 'This quiz has already finished.',
  already_started: 'This quiz already started and is closed to new players.',
  invalid_name: 'Pick a name between 1 and 20 characters.',
  name_taken: 'That name is already taken. Try another!',
  not_accepting: 'Answers are closed.',
  time_up: "Time's up!",
  already_answered: 'You already answered.',
  too_early: 'The timer has not finished yet.',
  banned: 'You have been banned from this quiz.',
  paused: 'The game is paused.',
  rejoin_failed: 'Name or PIN is wrong.',
  pin_locked: 'Too many wrong PINs. Ask the host to kick your old seat.',
  already_joined: 'You already have a seat in this quiz.',
  powerups_off: 'Power-ups are disabled in this quiz.',
  no_powerup: 'You have no uses of that power-up left.',
  powerup_unavailable: 'That power-up cannot be used on this question.',
  already_used: 'Already used on this question.',
  forbidden: 'Not allowed.',
  locked: 'You cannot answer right now!',
  too_hot: "It's too hot to touch!",
  no_card: "You don't have that card.",
  target_answered: 'That player already answered.',
  untargetable: 'That player cannot be targeted this question.',
  already_afflicted: 'That player is already afflicted this question.',
  cannot_target_teammate: "You can't target a teammate.",
  invalid_target: 'Pick another player.',
  card_unavailable: "That card can't be used on this question.",
  cards_off: 'Cards are disabled in this quiz.',
  passive_card: 'That card triggers automatically.',
  no_questions: 'Add at least one question first.',
}

export const friendlyError = (e) => ERRORS[e?.message] || e?.message || 'Something went wrong.'
