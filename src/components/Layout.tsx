import { NavLink, Outlet } from 'react-router'
import { useAuthSession } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { RestTimerBar, RestTimerProvider } from './RestTimer'
import { SignIn } from './SignIn'
import { SyncBanner } from './SyncBanner'

const tabs = [
  { to: '/', label: 'Today', end: true },
  { to: '/calendar', label: 'Calendar' },
  { to: '/feats', label: 'Feats' },
  { to: '/progress', label: 'Progress' },
  { to: '/more', label: 'More' },
]

export function Layout() {
  const session = useAuthSession()

  if (session === undefined) return null
  if (supabase && !session) {
    return (
      <main className="mx-auto max-w-lg px-4 pt-6">
        <SignIn />
      </main>
    )
  }

  return (
    <RestTimerProvider>
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col">
        {!supabase && (
          <p className="m-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
            Not connected to Supabase yet. Copy <code>.env.example</code> to <code>.env.local</code> and fill it in.
          </p>
        )}
        <SyncBanner />
        <main className="flex-1 px-4 pt-6 pb-48" style={{ paddingTop: 'max(1.5rem, env(safe-area-inset-top))' }}>
          <Outlet />
        </main>
        <div className="fixed inset-x-0 bottom-0 z-10">
          <RestTimerBar />
          <nav
            className="border-t border-neutral-200 bg-neutral-50/95 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95"
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
      </div>
    </RestTimerProvider>
  )
}
