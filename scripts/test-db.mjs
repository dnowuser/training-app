// Runs every migration plus the seed against an in-memory Postgres (PGlite)
// with small stand-ins for Supabase's auth and storage schemas, then checks
// session generation, deloads, week gating, log protection and row-level security.
// Usage: npm run db:test

import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const db = new PGlite()

const OWNER = '00000000-0000-4000-8000-000000000001'
const STRANGER = '00000000-0000-4000-8000-000000000002'
const CYCLE_START = '2026-10-19' // a Monday

const one = async (sql, params) => (await db.query(sql, params)).rows[0]
const all = async (sql, params) => (await db.query(sql, params)).rows
let passed = 0
const test = async (name, fn) => {
  await fn()
  passed += 1
  console.log(`  ok  ${name}`)
}

// ---- Supabase stand-ins ---------------------------------------------------------

await db.exec(`
  create role anon nologin;
  create role authenticated nologin;

  create schema auth;
  create table auth.users (id uuid primary key, email text, created_at timestamptz not null default now());
  create function auth.uid() returns uuid language sql stable as $$
    select coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    )::uuid
  $$;

  create schema storage;
  create table storage.buckets (id text primary key, name text not null, public boolean default false);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  create function storage.foldername(name text) returns text[] language sql immutable as $$
    select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
  $$;

  grant usage on schema public, auth, storage to authenticated, anon;
`)

// ---- migrations, accounts, seed --------------------------------------------------

const migrationsDir = join(root, 'supabase/migrations')
for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
  await db.exec(readFileSync(join(migrationsDir, file), 'utf8'))
}

await db.exec(`
  grant select, insert, update, delete on all tables in schema public to authenticated;
  grant execute on all functions in schema public to authenticated;
`)

await db.query(`insert into auth.users (id, email, created_at) values ($1, 'owner@example.com', now() - interval '1 day')`, [OWNER])
await db.query(`insert into auth.users (id, email) values ($1, 'stranger@example.com')`, [STRANGER])

await db.exec(readFileSync(join(root, 'supabase/seed.sql'), 'utf8'))

console.log('db:test')

await test('seed loads the program for the owner', async () => {
  const counts = await one(`
    select
      (select count(*)::int from exercises where user_id = '${OWNER}') as exercises,
      (select count(*)::int from template_slots where user_id = '${OWNER}') as slots,
      (select count(*)::int from template_items) as items,
      (select count(*)::int from feats) as feats,
      (select count(*)::int from feat_steps) as steps
  `)
  assert.equal(counts.slots, 7)
  assert.ok(counts.exercises > 40)
  assert.ok(counts.items > 70)
  assert.equal(counts.feats, 17)
  assert.ok(counts.steps > 50)
})

await test('seed refuses to run twice', async () => {
  await assert.rejects(db.exec(readFileSync(join(root, 'supabase/seed.sql'), 'utf8')), /Seed already applied/)
  await db.exec('rollback')
})

await test('start_cycle generates the first four weeks', async () => {
  await db.query(`select start_cycle('Cycle 1', $1::date)`, [CYCLE_START])
  const { n, first, last } = await one(`select count(*)::int as n, min(date)::text as first, max(date)::text as last from sessions`)
  assert.equal(n, 28)
  assert.equal(first, CYCLE_START)
  assert.equal(last, '2026-11-15')
  const monday = await one(`select name, week, day_type from sessions where date = $1::date`, [CYCLE_START])
  assert.equal(monday.name, 'Hard: jumps and squat')
  assert.equal(monday.week, 1)
})

await test('generation is idempotent', async () => {
  const { created } = await one(`select generate_sessions($1::date, $1::date + 27) as created`, [CYCLE_START])
  assert.equal(created, 0)
})

await test('Saturday intervals alternate: 400s in odd weeks, 1 km in even weeks', async () => {
  const exercisesOn = async (date) =>
    (await all(`select exercise_slug from session_log where date = $1::date`, [date])).map((r) => r.exercise_slug)
  const week1 = await exercisesOn('2026-10-24')
  const week2 = await exercisesOn('2026-10-31')
  assert.ok(week1.includes('interval-400') && !week1.includes('interval-1k'))
  assert.ok(week2.includes('interval-1k') && !week2.includes('interval-400'))
})

await test('planche leans appear from week 7 only', async () => {
  await db.query(`select generate_sessions($1::date, $1::date + 83)`, [CYCLE_START])
  const { n } = await one(`select count(*)::int as n from sessions`)
  assert.equal(n, 84)
  const fridayPlanche = await all(`
    select s.week from sessions s
    join session_exercises se on se.session_id = s.id
    join exercises e on e.id = se.exercise_id
    where e.slug = 'planche-lean' order by s.week`)
  assert.deepEqual(fridayPlanche.map((r) => r.week), [7, 8, 9, 10, 11, 12])
})

await test('deload weeks 6 and 12 halve the work and swap the ladder', async () => {
  const deloadWeeks = (await all(`select distinct week from sessions where is_deload order by week`)).map((r) => r.week)
  assert.deepEqual(deloadWeeks, [6, 12])
  const squat = await all(`
    select se.prescription from sessions s
    join session_exercises se on se.session_id = s.id
    join exercises e on e.id = se.exercise_id
    where s.week = 6 and e.slug = 'back-squat' order by se.position`)
  assert.equal(squat[0].prescription.scheme, undefined)
  assert.equal(squat[0].prescription.sets, 3)
  assert.equal(squat[0].prescription.pct_tm, 70)
  const pullups = await one(`
    select se.prescription from sessions s
    join session_exercises se on se.session_id = s.id
    join exercises e on e.id = se.exercise_id
    where s.week = 6 and e.slug = 'weighted-pull-up'`)
  assert.equal(pullups.prescription.sets, 2)
  const handstand = await one(`
    select se.prescription from sessions s
    join session_exercises se on se.session_id = s.id
    join exercises e on e.id = se.exercise_id
    where s.week = 6 and s.date = '2026-11-23' and e.slug = 'handstand-practice'`)
  assert.equal(handstand.prescription.minutes, 10)
})

await test('logged sets protect a session from deletion and regeneration', async () => {
  const se = await one(`
    select se.id from sessions s join session_exercises se on se.session_id = s.id
    where s.date = $1::date order by se.position limit 1`, [CYCLE_START])
  await db.query(`insert into sets (session_exercise_id, set_number, seconds) values ($1, 1, 180)`, [se.id])
  await db.query(`update sessions set customized = true where date = '2026-10-20'`)
  await db.query(`update template_slots set name = 'Hard: jumps, squat (edited)' where weekday = 1`)
  await db.query(`select regenerate_sessions($1::date, $1::date + 83)`, [CYCLE_START])
  const kept = await one(`select name from sessions where date = $1::date`, [CYCLE_START])
  assert.equal(kept.name, 'Hard: jumps and squat', 'session with sets must be kept')
  const customized = await one(`select customized from sessions where date = '2026-10-20'`)
  assert.equal(customized.customized, true, 'customized session must be kept')
  const rebuilt = await one(`select name from sessions where date = '2026-10-26'`)
  assert.equal(rebuilt.name, 'Hard: jumps, squat (edited)', 'untouched future session picks up the template change')
  await assert.rejects(db.query(`delete from sessions where date = $1::date`, [CYCLE_START]), /foreign key/)
})

await test('views report sets and feat progress', async () => {
  const logged = await one(`select count(*)::int as n from session_log where set_id is not null`)
  assert.equal(logged.n, 1)
  await db.query(`update feat_steps set achieved_on = '2026-10-20' where step_number = 1 and feat_id = (select id from feats where slug = 'front-lever')`)
  const fl = await one(`select steps_total::int, steps_done::int, current_step, current_step_description from feat_progress where slug = 'front-lever'`)
  assert.equal(fl.steps_total, 4)
  assert.equal(fl.steps_done, 1)
  assert.equal(fl.current_step, 2)
})

await test('row-level security: the owner sees their rows, another account sees none', async () => {
  const countAs = async (userId) => {
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${userId}', false);`)
    const { n } = await one(`select count(*)::int as n from sessions`)
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`)
    return n
  }
  assert.equal(await countAs(OWNER), 84)
  assert.equal(await countAs(STRANGER), 0)
})

await test('a signed-in user can only insert rows for themselves', async () => {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${STRANGER}', false);`)
  await db.query(`insert into metrics (kind, value, unit) values ('bodyweight', 180, 'lb')`)
  await assert.rejects(
    db.query(`insert into metrics (user_id, kind, value, unit) values ($1, 'bodyweight', 180, 'lb')`, [OWNER]),
    /row-level security/,
  )
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`)
  const mine = await one(`select user_id from metrics where kind = 'bodyweight'`)
  assert.equal(mine.user_id, STRANGER)
})

console.log(`db:test passed (${passed} checks)`)
