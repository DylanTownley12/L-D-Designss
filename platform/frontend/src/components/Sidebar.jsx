import { NavLink } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { dashboard as dashApi, agents as agentsApi } from '../api/client'
import {
  Radio, Users, Database, Crosshair, Globe, MessageSquare, Map, Settings,
} from 'lucide-react'

const nav = [
  { to: '/dashboard',   Icon: Radio,         label: 'COMMAND' },
  { to: '/agents',      Icon: Users,         label: 'WORKFORCE' },
  { to: '/leads',       Icon: Database,      label: 'INTELLIGENCE' },
  { to: '/outreach',    Icon: Crosshair,     label: 'OPERATIONS' },
  { to: '/previews',    Icon: Globe,         label: 'ASSETS' },
  { to: '/missed-call', Icon: MessageSquare, label: 'COMMS' },
  { to: '/plan',        Icon: Map,           label: 'STRATEGY' },
  { to: '/settings',    Icon: Settings,      label: 'CONFIG' },
]

function LogoMark() {
  return (
    <svg width="26" height="26" viewBox="0 0 28 28" fill="none">
      <path d="M14 2L26 14L14 26L2 14Z" fill="rgba(212,168,67,0.12)" stroke="#D4A843" strokeWidth="1.4"/>
      <path d="M14 8L20 14L14 20L8 14Z" fill="rgba(212,168,67,0.5)"/>
    </svg>
  )
}

function NavItem({ to, Icon, label, badge }) {
  const [hovered, setHovered] = useState(false)

  return (
    <NavLink
      to={to}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={({ isActive }) => ({
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        padding: '7px 9px',
        borderRadius: 7,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.1em',
        textDecoration: 'none',
        transition: 'all 0.13s ease',
        fontFamily: '"JetBrains Mono", monospace',
        borderLeft: isActive ? '2px solid #D4A843' : '2px solid transparent',
        background: isActive
          ? 'linear-gradient(90deg, rgba(212,168,67,0.1) 0%, rgba(212,168,67,0.012) 100%)'
          : hovered
          ? 'rgba(255,255,255,0.04)'
          : 'transparent',
        color: isActive ? 'rgba(255,255,255,0.9)' : hovered ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.28)',
      })}
    >
      {({ isActive }) => (
        <>
          <Icon
            size={14}
            style={{
              color: isActive ? '#D4A843' : hovered ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.22)',
              flexShrink: 0,
              transition: 'color 0.13s ease',
            }}
          />
          <span style={{ flex: 1 }}>{label}</span>
          {badge > 0 && (
            <span style={{
              background: '#D4A843', color: '#000', fontSize: 9,
              fontWeight: 800, minWidth: 16, height: 16, borderRadius: 999,
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px',
            }}>
              {badge}
            </span>
          )}
        </>
      )}
    </NavLink>
  )
}

export default function Sidebar() {
  const [unread, setUnread] = useState(0)
  const [activeAgents, setActiveAgents] = useState(0)

  useEffect(() => {
    const fetchUnread = () => {
      dashApi.notifications({ unread_only: true })
        .then(d => setUnread(d.notifications?.length || 0))
        .catch(() => {})
    }
    fetchUnread()
    const t = setInterval(fetchUnread, 30000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const fetchActive = async () => {
      try {
        const data = await agentsApi.logs(null, 20)
        const logs = data.logs || []
        const now = Date.now()
        const active = new Set(
          logs
            .filter(l => now - new Date(l.created_at).getTime() < 5 * 60 * 1000)
            .map(l => l.agent_name)
        )
        setActiveAgents(active.size)
      } catch {}
    }
    fetchActive()
    const t = setInterval(fetchActive, 10000)
    return () => clearInterval(t)
  }, [])

  return (
    <aside style={{
      width: 220,
      flexShrink: 0,
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: '#0a0a10',
      borderRight: '1px solid rgba(255,255,255,0.06)',
      position: 'relative',
    }}>
      {/* Atmospheric glow */}
      <div style={{
        position: 'absolute', top: 0, left: 0,
        width: '100%', height: 120,
        background: 'radial-gradient(ellipse at 50% 0%, rgba(212,168,67,0.08) 0%, transparent 70%)',
        pointerEvents: 'none', zIndex: 0,
      }} />

      {/* Logo */}
      <div style={{
        padding: '18px 16px 14px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        position: 'relative', zIndex: 1,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <LogoMark />
        <div style={{ flex: 1 }}>
          <div style={{
            fontSize: 14, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1,
            background: 'linear-gradient(135deg, #D4A843 0%, #F0C96A 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            L&D
          </div>
          <div style={{
            fontSize: 8, fontWeight: 700, letterSpacing: '0.16em',
            color: 'rgba(255,255,255,0.2)', marginTop: 2, textTransform: 'uppercase',
            fontFamily: '"JetBrains Mono", monospace',
          }}>
            AI OPERATING SYSTEM
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{
        flex: 1, padding: '10px 10px',
        display: 'flex', flexDirection: 'column', gap: 1,
        position: 'relative', zIndex: 1,
      }}>
        {nav.map(item => (
          <NavItem
            key={item.to}
            to={item.to}
            Icon={item.Icon}
            label={item.label}
            badge={item.label === 'COMMAND' ? unread : 0}
          />
        ))}
      </nav>

      {/* Footer */}
      <div style={{
        padding: '12px 16px',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'relative', zIndex: 1,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{ position: 'relative', width: 7, height: 7 }}>
            <div style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              background: '#10b981', opacity: 0.35,
              animation: 'ping 2s cubic-bezier(0,0,0.2,1) infinite',
              transform: 'scale(1.5)',
            }} />
            <div style={{
              position: 'relative', width: 7, height: 7, borderRadius: '50%',
              background: '#10b981', boxShadow: '0 0 7px rgba(16,185,129,0.7)',
            }} />
          </div>
          <span style={{
            fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.25)',
            letterSpacing: '0.12em', textTransform: 'uppercase',
            fontFamily: '"JetBrains Mono", monospace',
          }}>
            {activeAgents > 0 ? `${activeAgents} ACTIVE` : 'STANDBY'}
          </span>
        </div>
        <a
          href="https://dylantownley12.github.io/L-D-Designss"
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.12)', textDecoration: 'none' }}
        >
          Portfolio →
        </a>
      </div>
    </aside>
  )
}
