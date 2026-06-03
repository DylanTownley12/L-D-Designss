import { Key, Database, Mail, Phone, Sliders, ExternalLink, DollarSign } from 'lucide-react'

const sections = [
  {
    Icon: Mail,
    title: 'Gmail',
    items: [
      { label: 'GMAIL_ADDRESS',      value: 'Set in backend/.env', note: 'Your Gmail address' },
      { label: 'GMAIL_APP_PASSWORD', value: '••••••••••••••••',   note: 'App Password from Google Account → Security → App Passwords' },
    ],
  },
  {
    Icon: Key,
    title: 'OpenAI',
    items: [
      { label: 'OPENAI_API_KEY', value: 'sk-...', note: 'From platform.openai.com — uses gpt-4o-mini (~£0.001 per message)' },
    ],
  },
  {
    Icon: Database,
    title: 'Supabase',
    items: [
      { label: 'SUPABASE_URL',         value: 'https://xxx.supabase.co', note: 'From supabase.com → Project Settings → API' },
      { label: 'SUPABASE_SERVICE_KEY', value: 'eyJ...', note: 'Service role key — NOT the anon key' },
    ],
  },
  {
    Icon: Phone,
    title: 'Twilio SMS (Optional)',
    items: [
      { label: 'TWILIO_ACCOUNT_SID',  value: 'ACxxx...', note: 'From twilio.com/console — leave blank to disable SMS' },
      { label: 'TWILIO_AUTH_TOKEN',   value: '...',       note: 'Auth token from Twilio console' },
      { label: 'TWILIO_FROM_NUMBER',  value: '+441234567890', note: 'Your Twilio phone number' },
    ],
  },
  {
    Icon: Sliders,
    title: 'Behaviour',
    items: [
      { label: 'REQUIRE_APPROVAL',    value: 'true',  note: 'Set to false to auto-send without your approval (not recommended yet)' },
      { label: 'MAX_EMAILS_PER_DAY',  value: '50',    note: 'Stay under 500 to avoid Gmail spam flags. Start at 20–30.' },
      { label: 'MAX_SMS_PER_DAY',     value: '20',    note: 'Each SMS costs ~£0.04 with Twilio' },
    ],
  },
]

const costs = [
  { item: 'OpenAI (1,000 outreach emails)', cost: '~£0.15', period: 'one-time' },
  { item: 'Twilio SMS (per message)',        cost: '~£0.04', period: 'per SMS' },
  { item: 'Supabase',                        cost: 'Free',   period: 'up to 500MB / 50k rows' },
  { item: 'Railway backend hosting',         cost: '~£5',    period: 'per month' },
  { item: 'Vercel frontend hosting',         cost: 'Free',   period: 'hobby tier' },
  { item: 'Total to start',                  cost: '~£5-10', period: 'per month', highlight: true },
]

const links = [
  ['API Docs (local)',    'http://localhost:8000/docs'],
  ['Supabase Dashboard', 'https://app.supabase.com'],
  ['OpenAI Usage',       'https://platform.openai.com/usage'],
  ['Twilio Console',     'https://console.twilio.com'],
  ['Railway (backend)',  'https://railway.app'],
  ['Vercel (frontend)',  'https://vercel.com'],
]

export default function Settings() {
  return (
    <div style={{ padding: '24px', maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: 'rgba(255,255,255,0.9)' }}>Settings</h1>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>
          All settings live in{' '}
          <code style={{ fontSize: 11, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', padding: '1px 6px', borderRadius: 5, color: '#D4A843', fontFamily: '"JetBrains Mono", monospace' }}>
            platform/backend/.env
          </code>
        </p>
      </div>

      <div style={{
        background: 'linear-gradient(135deg, rgba(245,158,11,0.08) 0%, #0c0c12 100%)',
        border: '1px solid rgba(245,158,11,0.2)',
        borderRadius: 12, padding: '12px 16px',
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#fbbf24', marginBottom: 4 }}>How to change settings</div>
        <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.55)', margin: 0, lineHeight: 1.6 }}>
          Edit <code style={{ color: '#fbbf24', background: 'rgba(245,158,11,0.1)', padding: '1px 5px', borderRadius: 4, fontSize: 11, fontFamily: '"JetBrains Mono", monospace' }}>platform/backend/.env</code> directly.
          Never commit this file to GitHub. Restart the backend after changes.
        </p>
      </div>

      {sections.map(section => {
        const Icon = section.Icon
        return (
          <div key={section.title} style={{ background: '#0c0c12', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'hidden' }}>
            <div style={{
              padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,0.05)',
              display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.02)',
            }}>
              <Icon size={14} color="rgba(255,255,255,0.4)" />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.65)' }}>{section.title}</span>
            </div>
            <div>
              {section.items.map((item, i) => (
                <div key={item.label} style={{
                  padding: '12px 18px',
                  borderBottom: i < section.items.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                  display: 'flex', alignItems: 'flex-start', gap: 16,
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontSize: 11.5, fontWeight: 600, color: '#D4A843', marginBottom: 3,
                      fontFamily: '"JetBrains Mono", monospace',
                    }}>
                      {item.label}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.35)', lineHeight: 1.5 }}>{item.note}</div>
                  </div>
                  <div style={{
                    fontSize: 11, color: 'rgba(255,255,255,0.2)', flexShrink: 0, marginTop: 1,
                    fontFamily: '"JetBrains Mono", monospace',
                  }}>
                    {item.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}

      {/* Cost breakdown */}
      <div style={{ background: '#0c0c12', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.02)' }}>
          <DollarSign size={14} color="rgba(255,255,255,0.4)" />
          <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.65)' }}>Running Costs</span>
        </div>
        <div>
          {costs.map((c, i) => (
            <div key={c.item} style={{
              padding: '10px 18px',
              borderBottom: i < costs.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: c.highlight ? 'rgba(212,168,67,0.04)' : 'transparent',
            }}>
              <span style={{ fontSize: 13, color: c.highlight ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.5)', fontWeight: c.highlight ? 600 : 400 }}>
                {c.item}
              </span>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: c.highlight ? '#D4A843' : 'rgba(255,255,255,0.8)' }}>{c.cost}</div>
                <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.28)' }}>{c.period}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Useful links */}
      <div style={{ background: '#0c0c12', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <ExternalLink size={14} color="rgba(255,255,255,0.4)" />
          <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.65)' }}>Useful Links</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {links.map(([label, url]) => (
            <a key={label} href={url} target="_blank" rel="noopener noreferrer" style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 12.5, color: 'rgba(255,255,255,0.45)', textDecoration: 'none',
              padding: '7px 10px', borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.06)',
              background: 'rgba(255,255,255,0.02)',
              transition: 'all 0.15s ease',
            }}>
              <ExternalLink size={11} color="rgba(255,255,255,0.2)" />
              {label}
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
