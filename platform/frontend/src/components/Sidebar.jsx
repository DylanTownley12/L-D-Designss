import { NavLink } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { agents as agentsApi, team as teamApi } from '../api/client'
import { Zap, Network, Users, Database, Crosshair, Globe, Settings, Phone, Cpu } from 'lucide-react'

const nav = [
  { to: '/mission-control', Icon: Cpu, label: 'MISSION CTRL', highlight: true },
  { to: '/do-next',  Icon: Zap,       label: 'DO NEXT',  highlight: true,  badge: 'action' },
  { to: '/calls',    Icon: Phone,     label: 'CALLS',    highlight: true },
  { to: '/hub',      Icon: Network,   label: 'WAR ROOM',                   badge: 'approvals' },
  { to: '/agents',   Icon: Users,     label: 'AGENTS',                     badge: 'stale' },
  { to: '/leads',    Icon: Database,  label: 'LEADS' },
  { to: '/outreach', Icon: Crosshair, label: 'OUTREACH' },
  { to: '/previews', Icon: Globe,     label: 'PREVIEWS' },
  { to: '/settings', Icon: Settings,  label: 'CONFIG' },
]

const CYAN = '#00D4FF'
const GOLD = '#D4A843'

function LogoMark() {
  return (
    <div style={{ position: 'relative', width: 26, height: 26 }}>
      <div style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(circle, ${CYAN}25 0%, transparent 70%)`,
        animation: 'orbBreathe 3s ease-in-out infinite',
      }} />
      <svg width="26" height="26" viewBox="0 0 28 28" fill="none" style={{ position: 'relative' }}>
        <path d="M14 2L26 14L14 26L2 14Z" fill={`${GOLD}12`} stroke={GOLD} strokeWidth="1.4"/>
        <path d="M14 8L20 14L14 20L8 14Z" fill={`${GOLD}50`}/>
      </svg>
    </div>
  )
}

function NavItem({ to, Icon, label, badge, highlight, badges }) {
  const [hovered, setHovered] = useState(false)
  const count = badges?.[badge] || 0

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
        borderLeft: isActive ? `2px solid ${highlight ? GOLD : CYAN}` : '2px solid transparent',
        background: isActive
          ? highlight
            ? `linear-gradient(90deg, rgba(212,168,67,0.12) 0%, rgba(212,168,67,0.02) 100%)`
            : `linear-gradient(90deg, rgba(0,212,255,0.08) 0%, rgba(0,212,255,0.01) 100%)`
          : hovered
          ? 'rgba(255,255,255,0.04)'
          : highlight
          ? 'rgba(212,168,67,0.04)'
          : 'transparent',
        color: isActive
          ? 'rgba(255,255,255,0.9)'
          : hovered
          ? 'rgba(255,255,255,0.6)'
          : highlight
          ? 'rgba(212,168,67,0.7)'
          : 'rgba(255,255,255,0.25)',
        boxShadow: isActive ? `inset 0 0 20px ${highlight ? 'rgba(212,168,67,0.06)' : 'rgba(0,212,255,0.04)'}` : 'none',
      })}
    >
      {({ isActive }) => (
        <>
          <Icon
            size={14}
            style={{
              color: isActive ? (highlight ? GOLD : CYAN) : hovered ? 'rgba(255,255,255,0.4)' : highlight ? GOLD : 'rgba(255,255,255,0.2)',
              flexShrink: 0,
              transition: 'color 0.13s ease',
              filter: isActive ? `drop-shadow(0 0 4px ${highlight ? GOLD : CYAN}80)` : 'none',
            }}
          />
          <span style={{ flex: 1 }}>{label}</span>
          {count > 0 && (
            <span style={{
              background: badge === 'stale' ? '#fbbf24' : CYAN,
              color: '#000',
              fontSize: 9,
              fontWeight: 800,
              minWidth: 16,
              height: 16,
              borderRadius: 999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 4px',
            }}>
              {count}
            </span>
          )}
        </>
      )}
    </NavLink>
  )
}

export default function Sidebar() {
  const [badges, setBadges] = useState({ approvals: 0, stale: 0, action: 0 })
  const [systemOk, setSystemOk] = useState(true)

  useEffect(() => {
    let cancelled = false

    const poll = async () => {
      try {
        const [statusData, summaryData] = await Promise.allSettled([
          agentsApi.status(),
          teamApi.summary(),
        ])

        if (cancelled) return

        const status = statusData.status === 'fulfilled' ? statusData.value : null
        const summary = summaryData.status === 'fulfilled' ? summaryData.value : null

        const stale = status
          ? (status.counts?.stale || 0) + (status.counts?.error || 0)
          : 0
        const approvals = summary?.pending_approvals || 0

        setSystemOk(!stale && !approvals)
        setBadges(prev => ({ ...prev, stale, approvals }))
      } catch {}
    }

    poll()
    const t = setInterval(poll, 30000)
    return () => { cancelled = true; clearInterval(t) }
  }, [])

  return (
    <aside style={{
      width: 210,
      flexShrink: 0,
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: '#010110',
      borderRight: '1px solid rgba(0,212,255,0.08)',
      position: 'relative',
    }}>
      {/* Atmospheric glow */}
      <div style={{
        position: 'absolute', top: 0, left: 0,
        width: '100%', height: 130,
        background: `radial-gradient(ellipse at 50% 0%, rgba(0,212,255,0.06) 0%, transparent 70%)`,
        pointerEvents: 'none', zIndex: 0,
      }} />

      {/* Vertical accent line */}
      <div style={{
        position: 'absolute', right: 0, top: '10%', bottom: '10%', width: 1,
        background: `linear-gradient(180deg, transparent, rgba(0,212,255,0.15) 30%, rgba(0,212,255,0.15) 70%, transparent)`,
        pointerEvents: 'none',
      }} />

      {/* Logo */}
      <div style={{
        padding: '18px 16px 14px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        position: 'relative', zIndex: 1,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <LogoMark />
        <div style={{ flex: 1 }}>
          <div style={{
            fontSize: 14, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1,
            background: `linear-gradient(135deg, ${GOLD} 0%, #F0C96A 100%)`,
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            L&D
          </div>
          <div style={{
            fontSize: 7.5, fontWeight: 700, letterSpacing: '0.16em',
            color: `${CYAN}50`, marginTop: 2, textTransform: 'uppercase',
            fontFamily: '"JetBrains Mono", monospace',
          }}>
            AGENT OS
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
            badge={item.badge}
            highlight={item.highlight}
            badges={badges}
          />
        ))}
      </nav>

      {/* Footer — system health dot */}
      <div style={{
        padding: '12px 16px',
        borderTop: '1px solid rgba(255,255,255,0.05)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'relative', zIndex: 1,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{ position: 'relative', width: 7, height: 7 }}>
            <div style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              background: systemOk ? '#10b981' : '#fbbf24',
              opacity: 0.3,
              animation: 'ping 2s cubic-bezier(0,0,0.2,1) infinite',
              transform: 'scale(1.6)',
            }} />
            <div style={{
              position: 'relative', width: 7, height: 7, borderRadius: '50%',
              background: systemOk ? '#10b981' : '#fbbf24',
              boxShadow: `0 0 7px ${systemOk ? '#10b981' : '#fbbf24'}90`,
            }} />
          </div>
          <span style={{
            fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.22)',
            letterSpacing: '0.12em', textTransform: 'uppercase',
            fontFamily: '"JetBrains Mono", monospace',
          }}>
            {systemOk ? 'NOMINAL' : 'NEEDS ATTENTION'}
          </span>
        </div>
      </div>
    </aside>
  )
}
