# Ragnarok Quiz

A live, Norse-Ragnarok themed (pixel-art style) quiz game. React + React Router + Supabase (Auth, Postgres, Realtime, Storage).

## Setup

1. Create a Supabase project.
2. In the SQL editor, run [supabase/schema.sql](supabase/schema.sql).
3. Authentication → Providers: enable **Email** and **Anonymous sign-ins** (players use anonymous identities). Keep new-user signups enabled (anonymous sign-in needs it); there is no signup UI and only allowlisted hosts can create quizzes.
4. Copy `.env.example` to `.env` and fill in your project URL and anon/publishable key.
5. `npm install && npm run dev`

Hosts are added by you: Authentication → Users → *Add user* (email + password, auto-confirm), then run `insert into public.hosts (user_id) select id from auth.users where email = 'host@example.com';`.

Host: open `/admin` (not linked from the front page) and sign in, build a quiz, then **Host** → *Open lobby* → *Start*.
Players: open `/`, enter the 6-character code, pick a name.

## Features

- Admin dashboard with sidebar (Dashboard, My Quizzes, Create Quiz).
- Question types: single choice, multi-select, true/false, typed text (multiple accepted answers), number (with tolerance). Images on questions and on options (uploaded to Supabase Storage).
- Per-question time limit and points; faster correct answers score more.
- Live flow driven by the host: lobby → question → reveal → next → podium. Live leaderboard on the right.
- 8-bit UI, CSS animations, and synthesized chiptune sound effects/music (respects reduced motion).
- More question types: **ordering**, **matching pairs**, and **pin on image** (players tap the image; correct inside a host-set radius).
- **Team mode**: players auto-balance into 2–6 teams; team score is the per-member average.
- **Streak bonuses**: +10% of points per previous correct answer in a row (max +50%).
- **Ragnarok cards** (quiz setting): each player is dealt 3 cards, and everyone draws 1 every 3 questions (the bottom half of the board draws 2). One card per question.
  - Attack (pick any player who isn't a teammate): Metaller (silence 4s), Hatii Bebe (freeze 4s, 6 quick taps thaw it), Mutant Dragonoid (burns 2 choices 5s), Savage Baby (jumbles question 4s), Requiem (jumbles choices 4s), Familiar (blackout 3s), Plankton (blur 4s), Kraken (−30% pts), Boa (poison: points drain to −40% over 6s), Skeleton (−30% time and max 70% pts).
  - Self (must be played before you answer): Atroce (+50% pts), Phreeoni (×2 pts), Ghostring (untargetable), Angeling (immune to every card effect this question and cleanses ones already on you), Osiris (skip the question, streak kept), Doppelganger (50/50, single-choice with 3+ options).
  - Passive immunities, auto-consumed to block one attack from their family: Maarduk (Silence/Freeze/Burn), Giearth (Stun/Confusion/Darkness/Blur), Hard Explosion (Wound/Poison/Slow). Phreeoni is drawn about half as often as other self cards.
  - Card art: drop `public/cards/<id>.jpeg` (square, ~256px, pixel art works best) for any of `metaller hatii dragonoid savage requiem familiar plankton kraken boa skeleton atroce ghostring angeling phreeoni osiris doppel maarduk giearth hardexp`; missing files fall back to an emoji. Playing, being hit by, or blocking a card shows a full-screen cast animation. The host screen and the big-screen view show every card play to the room ("Alice cast Metaller on Bob!").
  - Locks, time, scoring and immunities are enforced server-side; blur, blackout and jumbling are display-only and can be switched off in quiz settings.
- **Pause/resume**, and optional **auto-advance** after the reveal (set in quiz settings).
- **Reconnect**: each player can view a 6-character PIN (🔑 in the HUD) and rejoin from another device with name + PIN. Host can **kick** or **ban** players (ban blocks the user and the name for that quiz).
- **Big-screen view** at `/watch/CODE` (host screen has a "copy big-screen link" button); read-only, never contains the answer before the reveal.
- **Audio settings** (speaker button): mute, music/effects volume, and track choice, saved per browser.

> After pulling these features, re-run the whole `supabase/schema.sql` (it is idempotent).

Notes: the host's browser drives the reveal and auto-advance, so keep the host tab open. Rejoining via PIN invalidates the old device's seat.

## Preventing duplicate joins

- Each player browser gets a persistent **anonymous Supabase user**; `players` has a unique `(quiz_id, user_id)` index, so one device = one seat. Refreshing or reopening the link restores the same seat instead of creating a new one.
- A unique `(quiz_id, lower(name))` index rejects duplicate/impersonating names (`name_taken`).
- Joining only happens via the `join_quiz` RPC, which also enforces lobby/started rules.
- Limitation: a player who clears storage or uses another browser/incognito gets a new identity. For strict control, the host can kick players from the lobby.

## Security model

- Answer keys live in `question_keys`, readable only by the quiz's host. Grading happens in the `submit_answer` RPC (server clock, one answer per player per question).
- Players can only read questions up to the current one, and receive the correct answer via `get_reveal` only during the reveal phase.
- All quiz state transitions go through `host_advance`, which checks host ownership.

## Anti-cheat

While a quiz is live, the player screen ([useAntiCheat.js](src/lib/useAntiCheat.js)) blocks right-click, text selection/copy/cut/paste (except inside answer fields), dragging, and shortcuts such as F12, DevTools combos, view-source, save, print, find and select-all. It also detects tab switches, window focus loss and docked DevTools. Each event shows the player a warning and is recorded via the `report_violation` RPC; the host sees a ⚠ count next to the player on the leaderboard.

These are deterrents only: client code can always be bypassed, so the real protections are server-side (hidden answer keys, server-side grading and timing). Re-run [supabase/schema.sql](supabase/schema.sql) to add the `violations` column and RPC.
