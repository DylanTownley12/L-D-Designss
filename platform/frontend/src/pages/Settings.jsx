export default function Settings() {
  const sections = [
    {
      title: '📧 Gmail',
      items: [
        { label: 'GMAIL_ADDRESS', value: 'Set in backend/.env', note: 'Your Gmail address' },
        { label: 'GMAIL_APP_PASSWORD', value: '••••••••••••••••', note: 'App Password from Google Account Settings → Security → App Passwords' },
      ],
    },
    {
      title: '🤖 OpenAI',
      items: [
        { label: 'OPENAI_API_KEY', value: 'sk-...', note: 'From platform.openai.com — uses gpt-4o-mini (~£0.001 per message)' },
      ],
    },
    {
      title: '🗄️ Supabase',
      items: [
        { label: 'SUPABASE_URL', value: 'https://xxx.supabase.co', note: 'From supabase.com → Project Settings → API' },
        { label: 'SUPABASE_SERVICE_KEY', value: 'eyJ...', note: 'Service role key — NOT the anon key' },
      ],
    },
    {
      title: '💬 Twilio SMS (Optional)',
      items: [
        { label: 'TWILIO_ACCOUNT_SID', value: 'ACxxx...', note: 'From twilio.com/console — leave blank to disable SMS' },
        { label: 'TWILIO_AUTH_TOKEN', value: '...', note: 'Auth token from Twilio console' },
        { label: 'TWILIO_FROM_NUMBER', value: '+441234567890', note: 'Your Twilio phone number' },
      ],
    },
    {
      title: '⚙️ Behaviour',
      items: [
        { label: 'REQUIRE_APPROVAL', value: 'true', note: 'Set to false to auto-send without your approval (not recommended yet)' },
        { label: 'MAX_EMAILS_PER_DAY', value: '50', note: 'Stay under 500 to avoid Gmail spam flags. Start at 20-30.' },
        { label: 'MAX_SMS_PER_DAY', value: '20', note: 'Each SMS costs ~£0.04 with Twilio' },
      ],
    },
  ]

  const costs = [
    { item: 'OpenAI (1,000 outreach emails)', cost: '~£0.15', period: 'one-time' },
    { item: 'Twilio SMS (per message)',       cost: '~£0.04', period: 'per SMS' },
    { item: 'Supabase',                       cost: 'Free',   period: 'up to 500MB / 50k rows' },
    { item: 'Railway backend hosting',        cost: '~£5',    period: 'per month' },
    { item: 'Vercel frontend hosting',        cost: 'Free',   period: 'hobby tier' },
    { item: 'Total to start',                 cost: '~£5-10', period: 'per month' },
  ]

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-white/40 text-sm mt-0.5">
          All settings are in <code className="text-gold bg-dark-3 px-1 rounded">platform/backend/.env</code>
        </p>
      </div>

      <div className="card rounded-xl p-4 border-amber-500/20 bg-amber-500/5">
        <p className="text-amber-400 text-sm font-medium mb-1">⚠️ How to change settings</p>
        <p className="text-white/60 text-sm">
          Edit the file <code className="text-amber-300 bg-dark-3 px-1 rounded">platform/backend/.env</code> directly.
          Never commit this file to GitHub. Restart the backend after changes.
        </p>
      </div>

      {sections.map(section => (
        <div key={section.title} className="card rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-white/6 bg-dark-3">
            <h2 className="font-semibold text-sm">{section.title}</h2>
          </div>
          <div className="divide-y divide-white/5">
            {section.items.map(item => (
              <div key={item.label} className="px-5 py-3.5 flex items-start gap-4">
                <div className="flex-1">
                  <div className="font-mono text-gold text-xs mb-0.5">{item.label}</div>
                  <div className="text-white/30 text-xs leading-relaxed">{item.note}</div>
                </div>
                <div className="font-mono text-xs text-white/20 flex-shrink-0 mt-0.5">{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Cost breakdown */}
      <div className="card rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-white/6 bg-dark-3">
          <h2 className="font-semibold text-sm">💰 Running Costs</h2>
        </div>
        <div className="divide-y divide-white/5">
          {costs.map(c => (
            <div key={c.item} className={`px-5 py-3 flex items-center justify-between ${
              c.item.includes('Total') ? 'bg-gold/5' : ''
            }`}>
              <span className={`text-sm ${c.item.includes('Total') ? 'font-semibold text-white' : 'text-white/60'}`}>
                {c.item}
              </span>
              <div className="text-right">
                <div className={`font-bold text-sm ${c.item.includes('Total') ? 'text-gold' : 'text-white'}`}>
                  {c.cost}
                </div>
                <div className="text-white/30 text-xs">{c.period}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Useful links */}
      <div className="card rounded-xl p-5">
        <h2 className="font-semibold text-sm mb-4">🔗 Useful Links</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          {[
            ['API Docs (local)', 'http://localhost:8000/docs'],
            ['Supabase Dashboard', 'https://app.supabase.com'],
            ['OpenAI Usage', 'https://platform.openai.com/usage'],
            ['Twilio Console', 'https://console.twilio.com'],
            ['Railway (backend host)', 'https://railway.app'],
            ['Vercel (frontend host)', 'https://vercel.com'],
          ].map(([label, url]) => (
            <a key={label} href={url} target="_blank" rel="noopener noreferrer"
               className="flex items-center gap-2 text-white/50 hover:text-gold transition-colors">
              <span className="text-xs">→</span> {label}
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
