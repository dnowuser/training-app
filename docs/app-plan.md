# Training app plan

A workout app that lines up each day's session, logs what you hit, tracks feats with photos and video, and that Claude can read and update from any chat.

## Approach

Your own web app on Supabase, with Supabase connected to claude.ai. You own the app and the media, and Claude can query and update the data from any chat through the connector, with no API key.

- Postgres tables hold the plan, sessions, sets and feats; a private Storage bucket holds photos and video; Auth keeps it to you.
- The Supabase connector is in claude.ai's directory, so Claude can see what you log from day one.
- Claude Code builds, deploys and changes the app.

**Stack:** React and TypeScript on Vercel, installable to the home screen. Sets will queue offline and sync when signal returns, so a gym dead zone loses nothing. Storage limits depend on the Supabase plan; heavy video use may need the paid tier.

**Guardrail:** the connector can run any query, so Claude edits only future sessions and logs every change in the change log. Past logs stay as recorded. Later, a small custom connector with narrow actions (read a week, update a future session, record a feat) can replace raw queries.

## How it fits together

One Supabase database sits in the middle. The app and Claude both read and write it, so neither needs the other.

```
You (phone) ──► Training app (React, Vercel) ◄──► Supabase (Postgres + Storage)
                       ▲                                ▲
                       │ ships updates                  │ queries and updates
                 Claude Code                     Claude, in any chat (Supabase connector)
```

## Daily flow

1. **Open the app.** Today's session shows first: warm-up, then each exercise with target sets, reps, weight or hold time, and rest. Ladder weights come from the training max, rounded to the nearest 5 lb.
2. **Tap Start.** The app steps through exercises in order with a rest timer between sets.
3. **Log each set.** One tap if you hit the target; otherwise adjust reps, weight, seconds or distance. Add a note if something felt off.
4. **Record a feat.** From any exercise, mark a ladder step or feat as hit and attach a photo or clip.
5. **Finish.** The session saves, skipped work is marked, and charts and streaks update.
6. **Ask Claude** anytime to review what you hit and adjust what's coming.

## Screens

| Screen | What it shows | Phase |
| --- | --- | --- |
| Today | The day's session, Start button, rest timer and set logging | 1 |
| Calendar | Every past and future day; past days show what you hit against the plan | 1 |
| Day detail | Plan vs actual for each exercise, notes and media, plus edit or move the session | 1 |
| Feats | All 17 feats with stage, current ladder step, next step and date achieved | 2 |
| Progress | Charts by area (below) | 2 |
| Media | Photo and video timeline, filtered by feat or exercise, side-by-side comparison | 2 |
| Search | Any log, note, feat or exercise by text, date or tag | 3 |
| Plan editor | The weekly template, exercises and targets, plus the change log. Changes apply to future days only | 3 |

## Data model

Thirteen tables, two views and three functions; full details in [CLAUDE.md](../CLAUDE.md) and the migration in `supabase/migrations/`.

- **Plan:** `cycles`, `template_slots` (one per weekday), `template_items` (exercises with prescriptions, optional week gating).
- **Days:** `sessions` and `session_exercises`, generated about four weeks ahead from the template by `generate_sessions()`, which also applies deload weeks.
- **Logs:** `sets`, protected from accidental deletion.
- **Feats:** `feats`, `feat_steps` (the ladders), `milestones` (anything you hit, linked to the set and media).
- **Everything else:** `exercises`, `media`, `metrics` (training maxes, bodyweight, touch height, run times), `changes` (the change log).

A lasting change edits the template and regenerates future days; a one-off change edits a single future session and marks it customized so regeneration leaves it alone. The change log makes every edit visible and reversible.

## Working with Claude

With the Supabase connector on, ask in any chat. Claude queries the same tables the app uses, and its changes show up the next time you open the app.

| You say | Claude does |
| --- | --- |
| "How did this week go?" | Compares the week's plan against what you logged and flags misses and trends |
| "When did I first hold a 30 s handstand?" | Searches milestones, sets and notes; returns the date and the clip |
| "Elbows are sore, adjust next week." | Cuts front lever and planche volume in next week's sessions and logs why |
| "Bench has stalled for three cycles." | Reworks the bench block in the template and resets the training max |
| "I ran a 6:20 mile today." | Records the result and the milestone, and moves the feat to its next step |
| "Plan the next 12-week cycle." | Writes a new template, promotes Next feats, and generates the future sessions |

**Rules Claude follows:** edit only future days, never past logs; write every change to the change log with a reason; ask before deleting anything. For chats outside this repo, paste the "Rules for changing the plan or the data" section of CLAUDE.md into a claude.ai project's instructions so every chat follows them.

## Progress charts

Every feat gets a chart with its target drawn in, so the gap to each goal is visible at a glance.

| Chart | Tracks |
| --- | --- |
| Training max and estimated 1RM per lift, with 315 and 405 target lines | Squat, bench, deadlift |
| Touch height over time, with the rim line | Dunks |
| Mile and 5K times, with target lines, plus interval pace | Running feats |
| Hold time per ladder step over time | Front lever, planche, handstand |
| Ladder step timeline for all 17 feats | Overall feat progress |
| Side-by-side photos at the same angle, plus ladder step | Splits, pancake, bridge |
| Weekly hard sets per muscle group | Accessories, delts and arms |
| Sessions done vs planned, as a calendar heatmap | Consistency |
| Bodyweight trend | Context for strength-to-weight feats |

## Build phases

Daily logging ships first because feats, charts and Claude's reviews all depend on its data. Move on when the gate is met.

1. **Phase 1, set up and log today:** Supabase project, connector on, database seeded with the current plan. Sign-in, Today screen, set logging, rest timer, Calendar, Day detail, offline set queue. Deploy to Vercel.
   - **Gate:** two weeks of logging with no friction. Every session logged in the app, and Claude can answer questions about the week from chat.
2. **Phase 2, feats, media and charts:** feat tracker with ladders, photo and video uploads, progress charts with target lines.
   - **Gate:** charts and feats match the logs. Claude reviews a full week and its edits land correctly in the app, each one in the change log.
3. **Phase 3, search, plan editor and the Claude loop:** search, plan editor, change log view, and an optional weekly review where Claude proposes next week from what you hit.

## Open questions

- [ ] Should Claude edit future days directly, or propose changes you approve in the app?
- [ ] Log effort per set (RPE), or just what you hit? (The `sets.rpe` column exists either way.)
- [x] Pounds throughout. (Assumed; say if not.)
- [ ] Track bodyweight in the app? (`metrics` supports it.)
- [ ] Typical clip length? Mostly short clips keep storage on the free tier.
- [ ] Apple Watch or HealthKit data (heart rate for Zone 2) later? A web app can't read it directly; that's a Brain or native-app job.
- [ ] Current training maxes for squat, bench and deadlift, and the Monday Cycle 1 starts.
