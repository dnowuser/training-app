import { NavLink, Outlet } from 'react-router'
import { supabase } from '../lib/supabase'

const tabs = [
  { to: '/', label: 'Today', end: true },
  { to: '/calendar', label: 'Calendar' },
  { to: '/feats', label: 'Feats' },
  { to: '/progress', label: 'Progress' },
  { to: '/more', label: 'More' },
]

export function Layout() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col">
      {!supabase && (
        <p className="m-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          Not connected to Supabase yet. Copy <code>.env.example</code> to <code>.env.local</code> and fill it in.
        </p>
      )}
      <main className="flex-1 px-4 pt-6 pb-28">
        <Outlet />
      </main>
      <nav
        className="fixed inset-x-0 bottom-0 border-t border-neutral-200 bg-neutral-50/95 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <ul className="mx-auto flex max-w-lg">
          {tabs.map((tab) => (
            <li key={tab.to} className="flex-1">
              <NavLink
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  `block py-3 text-center text-sm ${isActive ? 'font-semibold' : 'text-neutral-500 dark:text-neutral-400'}`
                }
              >
                {tab.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
