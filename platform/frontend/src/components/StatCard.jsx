export default function StatCard({ label, value, sub, color = 'gold', icon }) {
  const colors = {
    gold:   'border-gold/20 bg-gold/5',
    blue:   'border-blue-500/20 bg-blue-500/5',
    green:  'border-emerald-500/20 bg-emerald-500/5',
    purple: 'border-purple-500/20 bg-purple-500/5',
    red:    'border-red-500/20 bg-red-500/5',
  }
  const textColors = {
    gold:   'text-gold',
    blue:   'text-blue-400',
    green:  'text-emerald-400',
    purple: 'text-purple-400',
    red:    'text-red-400',
  }

  return (
    <div className={`card border ${colors[color]} p-5 rounded-xl`}>
      <div className="flex items-start justify-between mb-3">
        <span className="text-white/40 text-xs font-medium uppercase tracking-wider">{label}</span>
        {icon && <span className="text-xl">{icon}</span>}
      </div>
      <div className={`text-3xl font-bold ${textColors[color]} mb-1`}>{value}</div>
      {sub && <div className="text-white/35 text-xs">{sub}</div>}
    </div>
  )
}
