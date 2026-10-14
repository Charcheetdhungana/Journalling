import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { MonthView } from './pages/MonthView'
import { SettingsPage } from './pages/SettingsPage'
import { StatsPage } from './pages/StatsPage'
import { TradesPage } from './pages/TradesPage'
import { YearView } from './pages/YearView'

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<YearView />} />
        <Route path="month/:monthKey" element={<MonthView />} />
        <Route path="trades" element={<TradesPage />} />
        <Route path="stats" element={<StatsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
