import { useState, useEffect } from 'react'

const PLAN = [
  {
    day: 1, date: '2026-06-03', label: 'Wed 3 Jun', week: 1,
    focus: 'Get WA back + both of you set up and building',
    tasks: {
      you: [
        'Scan QR — run: openclaw channels login --channel whatsapp',
        'Give friend access to the GitHub repo and Railway dashboard',
        '30 min: 15 Instagram DMs to barbers from your own account',
        'Write down the 3 best things about your preview sites — use these in your opener',
        'Check all 13 agents are showing on the dashboard — screenshot it',
        'Read through the 113 outreach_sent leads — note which cities they\'re in',
        'Set up a Google Sheet: columns for leads messaged, replies, warm leads, converted',
      ],
      me: [
        'Verify first batch sends cleanly after QR scan',
        'Check enricher ran at 6am and found Instagram handles',
        'Pull reply stats — what message variants got replies so far?',
        'Fix any agent errors showing on dashboard',
      ],
      friend: [
        'Clone the L&D repo and get Claude Code running on it',
        'Send 15 manual WhatsApp DMs using the opener Dylan gives you',
        'Use Claude Code to run the lead finder — find 100 more barbers in a new city',
        'Check the leads came in on the dashboard',
        'Read CLAUDE.md and HANDOFF.md to understand the system',
        'Add your own column to the Google Sheet to track your DMs',
      ],
      openclaw: [
        'Back online, handling all inbound replies automatically',
        'Nudges anyone who goes quiet after 24h',
        'Sends 🔥 alert to Dylan when someone is ready to pay',
      ],
    },
  },
  {
    day: 2, date: '2026-06-04', label: 'Thu 4 Jun', week: 1,
    focus: 'Order SIMs + friend builds first feature',
    tasks: {
      you: [
        'Order 3 PAYG SIMs — Giffgaff or Lebara, £1 each',
        'Check 9am batch sent — verify in outreach logs on dashboard',
        '30 min: 15 Instagram DMs — target new city from friend\'s leads',
        'Reply personally to any barber who\'s replied — don\'t leave warm ones to Baz alone',
        'Write your 3-sentence sales pitch and memorise it',
        'Update your Google Sheet with today\'s numbers',
      ],
      me: [
        'Pull template stats — kill worst opener, write 2 new A/B variants',
        'Check reply rate from the week so far',
        'Add the 2 new variants to the WhatsApp queue system',
      ],
      friend: [
        'Send 15 manual WhatsApp DMs',
        'Use Claude Code to build a Facebook Groups scraper — find barbers in "barbers UK" groups',
        'Test the scraper finds at least 20 new leads and adds them to the DB',
        'Update your DM tracker with today\'s count',
        'Update Google Sheet with your numbers',
      ],
      openclaw: [
        'Auto-replying to all inbound',
        'New A/B variants deployed in queue',
      ],
    },
  },
  {
    day: 3, date: '2026-06-05', label: 'Fri 5 Jun', week: 1,
    focus: 'TikTok content + friend builds aesthetics landing page',
    tasks: {
      you: [
        'Film TikTok #1 — screen record building a barber preview, show before/after',
        'Caption: "I built this barber a free website in 20 mins — messaged him on WhatsApp"',
        '30 min: 15 Instagram DMs',
        'Post an Instagram story showing the dashboard — "the machine behind the business"',
        'Message 3 of your warmest leads personally today',
        'Update tracker: total DMs sent, total replies, reply rate so far',
      ],
      me: [
        'Write 3 new WhatsApp opener variants based on reply data',
        'Check reply rate for the week',
        'Generate Instagram DM scripts for the Facebook Groups leads',
      ],
      friend: [
        'Send 15 DMs. Post TikTok #1 on their account too for double reach',
        'Use Claude Code to build a landing page for the aesthetics AI product',
        'Page needs: headline, what it does, pricing placeholder, "book a demo" button',
        'Deploy to Vercel — this is what you send clinics when they ask for more info',
        'Share the Vercel URL with Dylan for feedback',
      ],
      openclaw: [
        'Running — handling all mid-conversation follow-ups',
        'Logging all reply categories to the agent log',
      ],
    },
  },
  {
    day: 4, date: '2026-06-06', label: 'Sat 6 Jun', week: 1,
    focus: 'Preview improvements + aesthetics backend deployed',
    tasks: {
      you: [
        'Open 5 barber previews — note what needs improving (headline, images, CTA)',
        'Tell me what to change and I\'ll implement it',
        'Research 10 barber shops on Instagram with NO website — save their usernames',
        'Calculate your reply rate so far — write it down',
        'Plan your Week 2 opener — what are you changing based on early objections?',
      ],
      me: [
        'Implement preview improvements Dylan flagged',
        'Push updated previews to Railway',
        'Write daily stats summary email for Dylan at 8am',
        'Add a quality score display to the preview cards',
      ],
      friend: [
        'Use Claude Code to deploy the aesthetics AI backend to Railway',
        'Create a new Railway project, set env vars from .env.example',
        'Run the Supabase migrations for the aesthetics DB',
        'Verify /health endpoint returns ok',
        'Document what you built in a README update',
      ],
      openclaw: [
        'Running',
        'Saturday morning follow-ups fired to quiet leads',
      ],
    },
  },
  {
    day: 5, date: '2026-06-07', label: 'Sun 7 Jun', week: 1,
    focus: 'Research day + VAPI setup',
    tasks: {
      you: [
        'Find 20 aesthetics clinics on Instagram — Manchester, Liverpool, Leeds',
        'Note: follower count, booking link in bio, how active they post',
        'Don\'t message yet — just build the list',
        'Review your TikTok performance — views, comments, follows',
        'Write your Week 2 opening script — what new angle will you try?',
      ],
      me: [
        'Nothing unless something breaks',
      ],
      friend: [
        'Sign up for VAPI.ai free trial',
        'Use Claude Code to call POST /api/calls/setup-assistant on the aesthetics backend',
        'Do a test call to the VAPI number — does Sophie answer? Does she sound right?',
        'Note every issue for fixing Monday',
        'Review aesthetics landing page copy — does it clearly explain the product?',
      ],
      openclaw: [
        'Running',
        'Sunday follow-ups — 1 message per thread max, no spamming',
      ],
    },
  },
  {
    day: 6, date: '2026-06-08', label: 'Mon 8 Jun', week: 1,
    focus: 'SIMs arrive + fix everything from weekend',
    tasks: {
      you: [
        'Set up WhatsApp on each new SIM — text a few real contacts first to warm up',
        'Wait 24h before using new numbers for outreach',
        'Read through all reply threads — spot patterns in objections',
        '30 min: 15 Instagram DMs',
        'Message 5 leads who opened but didn\'t reply — use a different angle',
        'Write your top 3 objection-handling responses and memorise them',
        'Update Google Sheet with Week 1 mid-point results',
      ],
      me: [
        'Deploy new A/B opener variants',
        'Update Baz playbook if new objection patterns spotted',
        'Check enricher found emails + Instagram handles for recent leads',
      ],
      friend: [
        'Fix any VAPI issues from Sunday test',
        'Use Claude Code to wire up Cal.com to the test clinic — real availability check',
        'Send 15 manual DMs',
        'Post an Instagram Reel about the aesthetics AI demo',
        'Update aesthetics landing page with Dylan\'s feedback',
        'Check Railway logs for overnight errors',
      ],
      openclaw: [
        'Running with updated playbook',
        'New SIM numbers added to outreach rotation',
      ],
    },
  },
  {
    day: 7, date: '2026-06-09', label: 'Tue 9 Jun', week: 1,
    focus: 'Week 1 review — stock-take everything',
    tasks: {
      you: [
        'Count total replies — reply rate per opener?',
        'List your 5 warmest leads and their current status',
        'Write down the top 3 objections barbers give you',
        '30 min: 15 Instagram DMs',
        'DM 3 warm leads personally — push for a decision',
        'Look at the dashboard — screenshot your best metric',
        'Post TikTok #2 — 30-second Week 1 recap: honest about what happened',
      ],
      me: [
        'Pull full stats — template performance, reply rates, enricher results',
        'Clean summary of what\'s working vs what\'s not',
        'Kill any A/B variants that aren\'t performing',
        'Identify top 10 leads most likely to convert this week',
      ],
      friend: [
        'Review landing page — update copy so it\'s crystal clear',
        'Use Claude Code to add a "demo request" form that emails you on submission',
        'Send 15 DMs — should have 100+ total by now',
        'Write up: what have you built so far? What works? What\'s left?',
        'Plan your Week 2 tasks — what aesthetics features are still to build?',
      ],
      openclaw: [
        'Running',
        'Week 1 summary stats sent to Dylan at 8am',
      ],
    },
  },
  {
    day: 8, date: '2026-06-10', label: 'Wed 10 Jun', week: 2,
    focus: 'Personal follow-ups + aesthetics voice tested end-to-end',
    tasks: {
      you: [
        'Message the 5 warmest barber leads yourself — not through Baz',
        '"Hey, did you get a chance to look at the preview? Happy to change anything."',
        'New SIMs active — more messages going out today',
        '30 min: 15 Instagram DMs',
        'Film TikTok #3 — "Showing a barber their free website for the first time"',
        'Log every reply thread — what is each lead\'s likely objection?',
        'Research the 10 most interested leads before next contact',
      ],
      me: [
        'Review aesthetics AI deployment — fix any gaps',
        'Write the full demo script for the aesthetics product',
        'Add conversion probability indicators to dashboard leads view',
        'Check all cron jobs ran correctly overnight',
      ],
      friend: [
        'Full end-to-end test call on the aesthetics AI',
        'Call VAPI number, try to book an appointment, verify Cal.com + Stripe link sent',
        'Test under-18 refusal — say you\'re 16 wanting Botox',
        'Test medical question refusal — "is it safe with my medication?"',
        'Log every bug and fix them with Claude Code',
      ],
      openclaw: [
        'Running',
        'Week 2 follow-up sequences triggered for stale leads',
      ],
    },
  },
  {
    day: 9, date: '2026-06-11', label: 'Thu 11 Jun', week: 2,
    focus: 'Aesthetics outreach starts — both of you hitting clinics',
    tasks: {
      you: [
        'DM 5 aesthetics clinics from your Sunday research list',
        '"Hey, built an AI receptionist for aesthetics clinics — handles bookings 24/7, chases no-shows. Happy to show you a demo?"',
        '30 min: 15 barber Instagram DMs',
        'Follow up on any barber leads gone quiet for 3+ days',
        'Check your Google Sheet — what\'s your current close rate?',
        'Research pricing: what do other AI receptionist services charge?',
        'Update your pitch based on Week 1 learnings',
      ],
      me: [
        'Fix any bugs from friend\'s end-to-end test',
        'Make sure owner WhatsApp alerts are firing correctly',
        'Check A/B test data — keep top 2 openers, cut the rest',
        'Pull enricher stats — emails found vs Instagram handles found',
      ],
      friend: [
        'DM 5 different aesthetics clinics — split the list so no doubling up',
        'Use Claude Code to build an aesthetics AI dashboard — shows bookings, calls, no-shows per clinic',
        'Send 15 barber DMs',
        'Write the aesthetics AI one-liner — what problem does it solve in 10 words?',
        'Fix any remaining bugs from the end-to-end test',
        'Check all Railway services are healthy',
        'Post an Instagram Reel update on the build',
      ],
      openclaw: [
        'Running',
        'Aesthetics lead follow-up sequences configured',
      ],
    },
  },
  {
    day: 10, date: '2026-06-12', label: 'Fri 12 Jun', week: 2,
    focus: 'Polish, follow-ups, TikTok content',
    tasks: {
      you: [
        'Follow up on aesthetics clinic replies from yesterday',
        'Check warm barber leads — any close to paying?',
        '30 min: 15 Instagram DMs',
        'Film TikTok #4 — "How I\'m getting barbers to reply to my cold DMs at 17"',
        'DM 5 more aesthetics clinics — different angle: "What happens when your receptionist is off sick?"',
        'Write out your personal sales script for when they ask for more info',
        'Update tracker with Week 2 Day 3 stats',
      ],
      me: [
        'Review and improve aesthetics AI system prompt based on test findings',
        'Add any missing FAQ handling',
        'Check dashboard is showing correct live metrics',
        'Write 2 more barber WhatsApp variants for new objection patterns',
      ],
      friend: [
        'Follow up on your 5 aesthetics clinic DMs',
        'Use Claude Code to add SMS reminders — 24h and 2h before each appointment',
        'Test a reminder fires correctly end-to-end',
        'Send 15 barber DMs',
        'Fix any SMS reminder bugs',
        'Update aesthetics dashboard with real booking data from test',
        'Document the full aesthetics AI feature list — done vs still to build',
      ],
      openclaw: [
        'Running',
        'Friday 11am follow-up batch sent to quiet leads',
      ],
    },
  },
  {
    day: 11, date: '2026-06-13', label: 'Sat 13 Jun', week: 2,
    focus: 'Content day — double the reach',
    tasks: {
      you: [
        'Post TikTok #5 — "Building a web design agency at 17 from my bedroom" — authentic, show the dashboard',
        'Reply to EVERY comment on your TikToks — algorithm boost',
        'Post 3 Instagram stories: dashboard, a preview site, ask followers if they know any barbers',
        'Message 3 warm barber leads — personal check-in',
        'Calculate this week\'s potential revenue: warm leads × £75 deposit',
        'Read all Baz reply threads — are there patterns you can use in your personal messages?',
      ],
      me: [
        'Generate full Week 2 stats summary',
        'Fix any overnight bugs',
      ],
      friend: [
        'Post TikTok #6 — "Helping my mate build an AI business, here\'s what we\'ve built" — different angle',
        'Reply to every comment on your TikTok',
        'Use Claude Code to build the no-show recovery flow — mark no-shows, auto-text to rebook',
        'Send 10 barber DMs (lighter Saturday)',
        'Review aesthetics dashboard — does it look good enough to demo to a real clinic?',
        'Calculate your DM reply rate — are you above or below Dylan\'s?',
      ],
      openclaw: [
        'Running',
        'Weekend follow-up batch configured — lighter touch',
      ],
    },
  },
  {
    day: 12, date: '2026-06-14', label: 'Sun 14 Jun', week: 2,
    focus: 'Rest day + light review',
    tasks: {
      you: [
        'Day off — check for any Baz 🔥 alerts and reply if needed',
        'Think about what you\'d do differently from day 1',
        'Write a 5-bullet honest reflection: what\'s working, what\'s not, what you\'d change',
        'Find 5 barbers who left a voicemail or called back — they\'re the hottest leads',
      ],
      me: [
        'Nothing — enjoy the day',
        'Sunday data backup check runs automatically',
      ],
      friend: [
        'Day off',
        'Optional: use Claude Code to run the reactivation flow on the test clinic',
        'Think about your aesthetics pitch — what are you going to say to a real clinic?',
        'List your top 3 feature ideas that would make clinics love the product',
      ],
      openclaw: [
        'Running — quiet mode, no proactive messages',
        'Monitoring for inbound only',
      ],
    },
  },
  {
    day: 13, date: '2026-06-15', label: 'Mon 15 Jun', week: 2,
    focus: 'Push for first sale + ROI report live',
    tasks: {
      you: [
        'Follow up on all 10 clinic DMs (yours + friend\'s combined)',
        'Find 5 more clinics and message them today',
        '30 min: 15 barber Instagram DMs',
        'Call (not text) your 2 warmest barber leads — voice closes faster',
        'Write your revenue target for June: how many clients to hit £500?',
        'Check TikTok analytics — which video performed best and why?',
        'Update tracker with full Week 2 Day 6 numbers',
      ],
      me: [
        'Pricing recommendations for aesthetics AI — what to charge',
        'Draft the aesthetics AI sales pitch in 3 sentences',
        'Check barber platform health — any overnight issues?',
        'Pull final week report data ready for Tuesday review',
      ],
      friend: [
        'Use Claude Code to get monthly ROI report working — POST /api/dashboard/{clinic_id}/monthly-report',
        'Verify the WhatsApp ROI summary sends to owner number',
        'DM 5 more aesthetics clinics',
        'Send 15 barber DMs',
        'Fix any ROI report bugs',
        'Update aesthetics demo script — what are you showing in a live demo?',
        'Confirm all Railway services are healthy going into final day',
      ],
      openclaw: [
        'Running',
        'Monday 9am outreach batch deployed on schedule',
      ],
    },
  },
  {
    day: 14, date: '2026-06-16', label: 'Tue 16 Jun', week: 2,
    focus: 'End of 2-week plan — review and decide what\'s next',
    tasks: {
      you: [
        'Count total results: deposits paid, warm leads, aesthetics clinic interest',
        'Calculate total outreach sent across all channels',
        'Calculate your overall reply rate — above or below 5%?',
        'Decide: double down on barbers, push aesthetics harder, or both?',
        'Write a 1-paragraph honest review — what surprised you most?',
        'Post TikTok #7 — "2 weeks building this at 17 — here\'s what actually happened"',
        'Message me and we\'ll plan week 3',
      ],
      me: [
        'Full 2-week stats review — all channels, conversion rates, what worked',
        'Draft week 3 plan based on results',
        'Identify top 15 leads most likely to convert for personal outreach push',
        'Send Dylan a full 2-week performance report',
      ],
      friend: [
        'Review together — what messages got the best response?',
        'Is the aesthetics AI demo-ready? Could you show it to a real clinic today?',
        'Use Claude Code to write up a full summary of everything built in 2 weeks',
        'Fix any remaining aesthetics platform bugs',
        'Deploy the final aesthetics features to Railway',
        'Write your 3-sentence pitch for the aesthetics AI',
        'Plan your first outreach call to a real aesthetics clinic',
      ],
      openclaw: [
        'Running',
        'End of 2-week stats logged and sent to Dylan at 8am',
      ],
    },
  },
]

const PEOPLE = [
  { key: 'you',      label: 'You',       color: 'text-gold',        bg: 'bg-gold/10',      border: 'border-gold/20'    },
  { key: 'me',       label: 'Claude',    color: 'text-blue-400',    bg: 'bg-blue-400/10',  border: 'border-blue-400/20' },
  { key: 'friend',   label: 'Friend',    color: 'text-purple-400',  bg: 'bg-purple-400/10', border: 'border-purple-400/20' },
  { key: 'openclaw', label: 'OpenClaw',  color: 'text-green-400',   bg: 'bg-green-400/10', border: 'border-green-400/20' },
]

function taskKey(day, person, idx) {
  return `plan_d${day}_${person}_${idx}`
}

function loadChecked() {
  try { return JSON.parse(localStorage.getItem('ld_plan_checked') || '{}') }
  catch { return {} }
}

function saveChecked(state) {
  localStorage.setItem('ld_plan_checked', JSON.stringify(state))
}

function getTodayDay() {
  const today = new Date().toISOString().slice(0, 10)
  const match = PLAN.find(d => d.date === today)
  return match?.day ?? null
}

export default function Plan() {
  const [checked, setChecked] = useState(loadChecked)
  const [expandedDay, setExpandedDay] = useState(getTodayDay() ?? 1)
  const todayDay = getTodayDay()

  const toggle = (day, person, idx) => {
    const key = taskKey(day, person, idx)
    const next = { ...checked, [key]: !checked[key] }
    setChecked(next)
    saveChecked(next)
  }

  const dayProgress = (day) => {
    const all = PEOPLE.flatMap(p => (PLAN.find(d => d.day === day)?.tasks[p.key] || []).map((_, i) => taskKey(day, p.key, i)))
    const done = all.filter(k => checked[k]).length
    return { done, total: all.length }
  }

  const totalProgress = () => {
    const all = PLAN.flatMap(d => PEOPLE.flatMap(p => (d.tasks[p.key] || []).map((_, i) => taskKey(d.day, p.key, i))))
    const done = all.filter(k => checked[k]).length
    return { done, total: all.length }
  }

  const { done: totalDone, total: totalTotal } = totalProgress()
  const pct = totalTotal > 0 ? Math.round((totalDone / totalTotal) * 100) : 0

  const week1 = PLAN.filter(d => d.week === 1)
  const week2 = PLAN.filter(d => d.week === 2)

  return (
    <div className="p-6 max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-1">2-Week Plan</h1>
        <p className="text-white/40 text-sm">3 Jun – 16 Jun 2026 · First sale target</p>
      </div>

      {/* Overall progress */}
      <div className="bg-dark-2 border border-white/6 rounded-xl p-4 mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-white/60">Overall progress</span>
          <span className="text-sm font-bold text-gold">{totalDone}/{totalTotal} tasks</span>
        </div>
        <div className="w-full bg-white/5 rounded-full h-2.5">
          <div
            className="h-2.5 rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, background: '#C9A84C' }}
          />
        </div>
        <div className="flex gap-4 mt-3">
          {PEOPLE.map(p => {
            const allTasks = PLAN.flatMap(d => (d.tasks[p.key] || []).map((_, i) => taskKey(d.day, p.key, i)))
            const doneTasks = allTasks.filter(k => checked[k]).length
            return (
              <div key={p.key} className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${p.bg} border ${p.border}`} />
                <span className={`text-xs ${p.color}`}>{p.label}: {doneTasks}/{allTasks.length}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Today banner */}
      {todayDay && (
        <div
          className="bg-gold/10 border border-gold/30 rounded-xl p-3 mb-6 cursor-pointer flex items-center justify-between"
          onClick={() => setExpandedDay(expandedDay === todayDay ? null : todayDay)}
        >
          <div className="flex items-center gap-2">
            <span className="text-gold text-sm font-bold">Today</span>
            <span className="text-white/60 text-sm">— {PLAN.find(d => d.day === todayDay)?.focus}</span>
          </div>
          <span className="text-gold/60 text-xs">
            {dayProgress(todayDay).done}/{dayProgress(todayDay).total} done
          </span>
        </div>
      )}

      {[{ label: 'Week 1 — Get the machine running and close the first sale', days: week1 },
        { label: 'Week 2 — Push for first sale + build aesthetics demo', days: week2 }
      ].map(week => (
        <div key={week.label} className="mb-8">
          <h2 className="text-xs font-semibold text-white/30 uppercase tracking-widest mb-3">{week.label}</h2>
          <div className="space-y-2">
            {week.days.map(day => {
              const { done, total } = dayProgress(day.day)
              const isToday = day.day === todayDay
              const isExpanded = expandedDay === day.day
              const isPast = todayDay && day.day < todayDay

              return (
                <div
                  key={day.day}
                  className={`border rounded-xl overflow-hidden transition-all ${
                    isToday
                      ? 'border-gold/30 bg-gold/5'
                      : isPast && done === total && total > 0
                      ? 'border-green-400/20 bg-green-400/5'
                      : 'border-white/6 bg-dark-2'
                  }`}
                >
                  {/* Day header */}
                  <button
                    className="w-full flex items-center gap-3 px-4 py-3 text-left"
                    onClick={() => setExpandedDay(isExpanded ? null : day.day)}
                  >
                    <div className={`text-xs font-bold w-6 text-center rounded ${isToday ? 'text-gold' : 'text-white/25'}`}>
                      {day.day}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-semibold ${isToday ? 'text-gold' : isPast ? 'text-white/50' : 'text-white/80'}`}>
                          {day.label}
                        </span>
                        {isToday && <span className="text-xs bg-gold text-black font-bold px-1.5 py-0.5 rounded">Today</span>}
                      </div>
                      <div className="text-xs text-white/30 mt-0.5 truncate">{day.focus}</div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {done > 0 && (
                        <span className={`text-xs ${done === total ? 'text-green-400' : 'text-white/40'}`}>
                          {done}/{total}
                        </span>
                      )}
                      <span className="text-white/20 text-xs">{isExpanded ? '▲' : '▼'}</span>
                    </div>
                  </button>

                  {/* Expanded tasks */}
                  {isExpanded && (
                    <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                      {PEOPLE.map(person => {
                        const tasks = day.tasks[person.key] || []
                        if (!tasks.length) return null
                        return (
                          <div key={person.key} className={`rounded-lg border p-3 ${person.bg} ${person.border}`}>
                            <div className={`text-xs font-bold mb-2 ${person.color}`}>{person.label}</div>
                            <ul className="space-y-2">
                              {tasks.map((task, idx) => {
                                const key = taskKey(day.day, person.key, idx)
                                const done = checked[key]
                                return (
                                  <li
                                    key={idx}
                                    className="flex items-start gap-2 cursor-pointer"
                                    onClick={() => toggle(day.day, person.key, idx)}
                                  >
                                    <div className={`mt-0.5 w-4 h-4 flex-shrink-0 rounded border flex items-center justify-center transition-all ${
                                      done
                                        ? `${person.bg} ${person.border}`
                                        : 'border-white/20 bg-transparent'
                                    }`}>
                                      {done && <span className={`text-xs ${person.color}`}>✓</span>}
                                    </div>
                                    <span className={`text-xs leading-relaxed ${done ? 'line-through text-white/25' : 'text-white/70'}`}>
                                      {task}
                                    </span>
                                  </li>
                                )
                              })}
                            </ul>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
