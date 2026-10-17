import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'
import './index.css'
import { Layout } from './components/Layout'
import { CalendarScreen } from './routes/Calendar'
import { DayScreen } from './routes/Day'
import { ExerciseScreen, ExercisesScreen } from './routes/Exercises'
import { FeatDetailScreen, FeatsScreen } from './routes/Feats'
import { MediaScreen } from './routes/Media'
import { PlanScreen } from './routes/Plan'
import { ProgressScreen } from './routes/Progress'
import { ReviewScreen } from './routes/Review'
import { MoreScreen, NotFoundScreen } from './routes/screens'
import { SearchScreen } from './routes/Search'
import { TodayScreen } from './routes/Today'

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { index: true, element: <TodayScreen /> },
      { path: 'calendar', element: <CalendarScreen /> },
      { path: 'day/:date', element: <DayScreen /> },
      { path: 'feats', element: <FeatsScreen /> },
      { path: 'feats/:slug', element: <FeatDetailScreen /> },
      { path: 'exercises', element: <ExercisesScreen /> },
      { path: 'exercises/:slug', element: <ExerciseScreen /> },
      { path: 'progress', element: <ProgressScreen /> },
      { path: 'more', element: <MoreScreen /> },
      { path: 'media', element: <MediaScreen /> },
      { path: 'search', element: <SearchScreen /> },
      { path: 'plan', element: <PlanScreen /> },
      { path: 'review', element: <ReviewScreen /> },
      { path: '*', element: <NotFoundScreen /> },
    ],
  },
])

// Offline app shell (production only, so dev always serves fresh code).
// When a new version takes over an already-open page, reload once so the page
// and its files come from the same version.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const hadController = Boolean(navigator.serviceWorker.controller)
  let reloaded = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !reloaded) {
      reloaded = true
      window.location.reload()
    }
  })
  window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js'))
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
