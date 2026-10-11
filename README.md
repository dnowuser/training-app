# Training

A personal training app: open it and today's workout is lined up, log what you hit, track feats with photos and video, and see progress over time. Data lives in Supabase, so Claude can read it and adjust the plan from chat through the Supabase connector.

- [Training plan](docs/training-plan.md): the program, the 17 feats and their ladders
- [App plan](docs/app-plan.md): screens, data model, how Claude fits in, build phases
- [CLAUDE.md](CLAUDE.md): conventions and rules for Claude sessions working on this repo

## Setup

1. **Create a Supabase project** at [supabase.com](https://supabase.com).
2. **Run the schema.** In the SQL editor, run each file in `supabase/migrations/` in order. (Or with the Supabase CLI: `supabase link` then `supabase db push`.)
3. **Create your account and set up sign-in.** The app signs in by email and never creates accounts itself.
   - Add yourself under Authentication → Users, then turn off new sign-ups so nobody else can create an account.
   - Under Authentication → URL Configuration, set the Site URL to the deployed app (and add `http://localhost:5173` as a redirect URL for development).
   - Under Authentication → Emails → Magic Link, add the code to the template, e.g. `<p>Code: {{ .Token }}</p>`. The link works in a browser tab; the code is what you type in the home-screen app, where links open in the browser instead.
4. **Load the program.** In the SQL editor, run `supabase/seed.sql`. It attaches everything to your account and refuses to run twice.
5. **Record training maxes** in pounds. Replace the three placeholders and the date:
   ```sql
   insert into metrics (kind, exercise_id, value, unit, measured_on)
   select 'training_max', e.id, v.tm, 'lb', 'YYYY-MM-DD'
   from exercises e
   join (values ('back-squat', SQUAT_TM), ('bench-press', BENCH_TM), ('deadlift', DEADLIFT_TM)) as v(slug, tm)
     on v.slug = e.slug;
   ```
6. **Start the first cycle** on the Monday you begin. This generates the first four weeks:
   ```sql
   select start_cycle('Cycle 1', 'YYYY-MM-DD');
   ```
7. **Run it locally:**
   ```bash
   cp .env.example .env.local   # fill in the project URL and publishable key
   npm install
   npm run dev
   ```
8. **Deploy** by importing the repo into Vercel and adding the two `VITE_SUPABASE_*` environment variables.
9. **Connect Claude:** add the Supabase connector in claude.ai, so Claude can read your logs and edit future sessions from any chat.

With the Supabase connector connected, Claude can do steps 2 and 4–6 for you.

## Development

```bash
npm run check   # lint, unit tests, database tests (in-memory Postgres) and build
```

Schema changes go in a new file under `supabase/migrations/`; see CLAUDE.md.
