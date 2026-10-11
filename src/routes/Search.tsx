import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { formatDay } from '../lib/dates'
import { search, type SearchResult } from '../lib/search'
import { supabase } from '../lib/supabase'

const KIND_LABEL: Record<SearchResult['kind'], string> = {
  day: 'Day',
  feat: 'Feat',
  milestone: 'Milestone',
  set: 'Logged set',
  session: 'Session',
  media: 'Media',
  change: 'Change',
  exercise: 'Exercise',
}

export function SearchScreen() {
  const [params, setParams] = useSearchParams()
  const [text, setText] = useState(params.get('q') ?? '')
  const [results, setResults] = useState<SearchResult[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const q = params.get('q') ?? ''

  // Debounce typing into the URL, so back/forward keep the search.
  useEffect(() => {
    const id = setTimeout(() => setParams(text.trim() ? { q: text.trim() } : {}, { replace: true }), 300)
    return () => clearTimeout(id)
  }, [text, setParams])

  useEffect(() => {
    if (!supabase || !q) return
    let cancelled = false
    search(supabase, q).then(
      (r) => !cancelled && setResults(r),
      (e: unknown) => !cancelled && setError(e instanceof Error ? e.message : String(e)),
    )
    return () => {
      cancelled = true
    }
  }, [q])

  return (
    <section>
      <h1 className="text-2xl font-semibold">Search</h1>
      <input
        type="search"
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Exercise, note, feat, or a date like 10/12"
        className="mt-3 h-12 w-full rounded-xl border border-neutral-300 bg-white px-4 text-lg dark:border-neutral-700 dark:bg-neutral-900"
      />
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {q && results && results.length === 0 && <p className="mt-4 text-neutral-500">Nothing found for “{q}”.</p>}
      {q && results && (
        <ul className="mt-4 divide-y divide-neutral-200 dark:divide-neutral-800">
          {results.map((r, i) => (
            <li key={i}>
              <Link to={r.to} className="block py-3">
                <span className="text-xs text-neutral-500">
                  {KIND_LABEL[r.kind]}
                  {r.date ? ` · ${formatDay(r.date)}` : ''}
                </span>
                <span className="block font-medium">{r.title}</span>
                <span className="block truncate text-sm text-neutral-600 dark:text-neutral-300">{r.detail}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {!q && (
        <p className="mt-4 text-sm text-neutral-500">
          Try “front lever”, “elbow”, “bench”, or a date. Searches logged sets and their notes, session notes, feats, milestones, photo
          captions and the change log.
        </p>
      )}
    </section>
  )
}
