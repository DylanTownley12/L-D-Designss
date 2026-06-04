import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import Leads from './pages/Leads'
import Outreach from './pages/Outreach'
import Previews from './pages/Previews'
import Settings from './pages/Settings'
import MissedCall from './pages/MissedCall'
import Agents from './pages/Agents'
import Plan from './pages/Plan'
import Live from './pages/Live'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public live page — no sidebar */}
        <Route path="/live" element={<Live />} />

        {/* Dashboard app */}
        <Route path="*" element={
          <div className="flex h-screen overflow-hidden bg-dark">
            <Sidebar />
            <main className="flex-1 overflow-y-auto">
              <Routes>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/leads" element={<Leads />} />
                <Route path="/outreach" element={<Outreach />} />
                <Route path="/previews" element={<Previews />} />
                <Route path="/missed-call" element={<MissedCall />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/agents" element={<Agents />} />
                <Route path="/plan" element={<Plan />} />
              </Routes>
            </main>
          </div>
        } />
      </Routes>
    </BrowserRouter>
  )
}
