export default function StatCard({ label, value, sub, color = 'gold', icon: Icon }) {
  const palette = {
    gold:   { border: 'rgba(212,168,67,0.22)',    bg: 'rgba(212,168,67,0.07)',    text: '#D4A843',  glow: 'rgba(212,168,67,0.12)' },
    blue:   { border: 'rgba(59,130,246,0.22)',    bg: 'rgba(59,130,246,0.07)',    text: '#60a5fa',  glow: 'rgba(59,130,246,0.1)' },
    green:  { border: 'rgba(16,185,129,0.22)',    bg: 'rgba(16,185,129,0.07)',    text: '#34d399',  glow: 'rgba(16,185,129,0.1)' },
    purple: { border: 'rgba(168,85,247,0.22)',    bg: 'rgba(168,85,247,0.07)',    text: '#c084fc',  glow: 'rgba(168,85,247,0.1)' },
    red:    { border: 'rgba(239,68,68,0.22)',     bg: 'rgba(239,68,68,0.07)',     text: '#f87171',  glow: 'rgba(239,68,68,0.1)' },
  }
  const p = palette[color] || palette.gold

  return (
    <div style={{
      background: `linear-gradient(135deg, ${p.bg} 0%, #0c0c12 100%)`,
      border: `1px solid ${p.border}`,
      borderRadius: 14,
      padding: '18px 20px',
      position: 'relative',
      overflow: 'hidden',
      boxShadow: `0 4px 20px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.04)`,
    }}>
      {/* Corner glow */}
      <div style={{
        position: 'absolute', top: 0, right: 0,
        width: 90, height: 90,
        background: `radial-gradient(circle at top right, ${p.glow}, transparent 65%)`,
        pointerEvents: 'none',
      }} />
      {/* Label row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 10,
      }}>
        <span className="text-label">{label}</span>
        {Icon && <Icon size={14} color={p.text} style={{ opacity: 0.7 }} />}
      </div>
      {/* Value */}
      <div className="count-anim num-display" style={{ fontSize: 32, color: p.text, marginBottom: 4 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.22)', marginTop: 2 }}>{sub}</div>}
      {/* Bottom accent */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 1,
        background: `linear-gradient(90deg, ${p.border}, transparent 60%)`,
      }} />
    </div>
  )
}
