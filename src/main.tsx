import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'
import './index.css'
import { Layout } from './components/Layout'
import {
  CalendarScreen,
  DayScreen,
  FeatsScreen,
  MediaScreen,
  MoreScreen,
  NotFoundScreen,
  PlanScreen,
  ProgressScreen,
  SearchScreen,
} from './routes/screens'
import { TodayScreen } from './routes/Today'

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { index: true, element: <TodayScreen /> },
      { path: 'calendar', element: <CalendarScreen /> },
      { path: 'day/:date', element: <DayScreen /> },
      { path: 'feats', element: <FeatsScreen /> },
      { path: 'progress', element: <ProgressScreen /> },
      { path: 'more', element: <MoreScreen /> },
      { path: 'media', element: <MediaScreen /> },
      { path: 'search', element: <SearchScreen /> },
      { path: 'plan', element: <PlanScreen /> },
      { path: '*', element: <NotFoundScreen /> },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
