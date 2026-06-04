import { useState } from 'react'

const C = {
  bg:        '#02020e',
  panel:     'rgba(0, 8, 28, 0.7)',
  border:    'rgba(0, 212, 255, 0.1)',
  borderDim: 'rgba(0, 212, 255, 0.06)',
  cyan:      '#00D4FF',
  blue:      '#0055FF',
  gold:      '#D4A843',
  green:     '#00FF88',
  red:       '#FF3355',
  text:      'rgba(255,255,255,0.88)',
  textMid:   'rgba(255,255,255,0.42)',
  textDim:   'rgba(255,255,255,0.16)',
  mono:      '"JetBrains Mono", monospace',
}
const lbl = (extra = {}) => ({ fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: C.textDim, fontFamily: C.mono, ...extra })
const panelStyle = (extra = {}) => ({ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, ...extra })

const PLAN = [
  {
    day: 1, date: '2026-06-03', label: 'Wed 3 Jun', week: 1,
    focus: 'Get WA running + understand where you actually stand',
    tasks: {
      you: [
        'Verify Baz works — send a test message from your friend\'s phone and confirm it auto-replies within 30 seconds. If it doesn\'t, something\'s still broken.',
        'Give friend repo and Railway access — then spend 20 minutes actually walking them through the system. They need to understand it, not just have access.',
        'Instagram outreach (45 min) — find 15 barbers with no website, write a personalised DM for each using something specific from their profile, send all 15. Note which 3 you think will reply and why.',
        'Spend 15 mins on the dashboard — understand every number. Write down the one metric you most want to move by end of this week.',
        'Read through all 113 outreach_sent leads — which cities got the most messages? Which are completely ignored? This shapes your next targets.',
      ],
      me: [
        'Run diagnostics on the first batch after QR scan — check logs for clean sends, no errors',
        'Check the 6am enricher found Instagram handles — how many leads now have a social profile?',
        'Pull current reply rate per A/B variant — which opener is actually working?',
        'Fix any agent errors showing on the dashboard',
      ],
      friend: [
        'Clone the repo, install dependencies, get the dev server running locally — verify the dashboard loads before touching anything else',
        'Read CLAUDE.md and HANDOFF.md cover to cover — understand the full system before you build on it',
        'Send 15 manual WhatsApp DMs using the opener Dylan gives you — personalise each one with the barber\'s name and city',
        'Use Claude Code to run the lead finder for a city neither of you have targeted — aim for 100+ new leads and verify they appear on the dashboard',
      ],
      openclaw: [
        'Online and auto-replying — confirmed with test message from different number',
        'Monitoring for 🔥 payment-ready signals and alerting Dylan immediately',
      ],
    },
  },
  {
    day: 2, date: '2026-06-04', label: 'Thu 4 Jun', week: 1,
    focus: 'SIMs ordered + analyse every reply you\'ve had so far',
    tasks: {
      you: [
        'Order 3 PAYG SIMs right now — Giffgaff or Lebara. Takes 5 minutes online. Write down the order confirmation.',
        'Spend 30 minutes going through every reply you\'ve had so far. Categorise each one: price question / already got a website / interested but stalling / not interested / went cold. What\'s the most common category? That\'s what you fix next.',
        'Instagram outreach (45 min) — 15 DMs, different city from yesterday. Personalise each one.',
        'Check the 9am batch sent correctly — look at the actual logs on the dashboard, not just the number. Any failed sends or errors?',
        'Reply personally to any barber who\'s responded — your personal reply rate will always beat Baz\'s on warm leads. Don\'t hand these off.',
      ],
      me: [
        'Based on Dylan\'s reply categorisation — kill the weakest opener variant and write 2 replacements targeting the most common objection',
        'Pull hard reply rate numbers per variant — present it clearly so Dylan knows what\'s winning',
        'Update the outreach queue with the new variants',
      ],
      friend: [
        'Send 15 manual WhatsApp DMs — different city from Dylan\'s',
        'Use Claude Code to search Facebook Groups for UK barbers posting actively. Find 20+ leads not in the database already, add them. This is a new lead source the system doesn\'t have yet.',
        'Review what the lead finder actually scraped vs what you expected — quality issues? Duplicates? Wrong businesses? Flag them.',
        'Document what you built today and what\'s left to do',
      ],
      openclaw: [
        'Auto-replying to all inbound messages',
        'New A/B opener variants queued for the next batch',
      ],
    },
  },
  {
    day: 3, date: '2026-06-05', label: 'Fri 5 Jun', week: 1,
    focus: 'First TikTok filmed + aesthetics landing page live',
    tasks: {
      you: [
        'Film TikTok #1 — screen record the actual process: open dashboard, pick a lead, generate preview, copy the WhatsApp message, show the preview site. Voice over what you\'re doing. 60 seconds. Upload it.',
        'Instagram outreach (45 min) — 15 DMs, new city. After each one, note what specific thing you mentioned about their shop. Which personalisation feels most natural?',
        'Message 3 of your warmest leads personally — not the template, your actual words.',
        'Post an Instagram story showing the dashboard — "the AI behind the agency." Builds credibility for when barbers check your profile after you DM them.',
        'Anyone who got a preview link 48+ hours ago and hasn\'t replied — personal follow-up today. "Did the preview come through alright?" Just that.',
      ],
      me: [
        'Write 3 new opener variants targeting the most common objection from Dylan\'s Day 2 categorisation',
        'Generate Instagram DM scripts for the Facebook Groups leads friend found',
        'Check reply rate trend — is it improving from the first batch?',
      ],
      friend: [
        'Send 15 DMs. Post TikTok #1 on your own account too — different audience, double the reach with zero extra work.',
        'Use Claude Code to build a single-page aesthetics AI landing page: clear headline, 3 bullets on what it does, pricing section, a "book a demo" button. It needs to be clear enough that a clinic owner gets it in 10 seconds.',
        'Deploy it to Vercel and share the URL with Dylan for feedback',
        'Fix whatever Dylan says is unclear — don\'t argue, just fix it',
      ],
      openclaw: [
        'Running — handling all open threads',
        'Preview nudges sent to leads who\'ve been quiet 48+ hours',
      ],
    },
  },
  {
    day: 4, date: '2026-06-06', label: 'Sat 6 Jun', week: 1,
    focus: 'Fix the previews based on real feedback + aesthetics backend deployed',
    tasks: {
      you: [
        'Open 10 barber preview sites one by one. Imagine you\'re a barber seeing this for the first time. Write a specific list: exact headline wording that should change, what images should show, what the CTA button should say. Give me that list and I\'ll fix everything today.',
        'Find 10 barbers on Instagram with absolutely no website — just a Facebook page or nothing. Save their handle, city, follower count. These are your next personal DM targets.',
        'Work out your actual reply rate: total replies ÷ total sent × 100. Write it down. Above or below 3%? What would double it?',
        'Plan your Week 2 opener — based on what you\'ve learned this week, what\'s the one thing you\'d change about the first message?',
      ],
      me: [
        'Implement every preview change Dylan listed — update the template and redeploy',
        'Push updated previews to Railway',
        'Run full pipeline health check — any agents erroring, any scheduled jobs that didn\'t fire?',
        'Analyse which day of the week gets the most replies — any pattern worth acting on?',
      ],
      friend: [
        'Use Claude Code to deploy the aesthetics AI backend to a new Railway project — follow .env.example exactly, run migrations, verify /health returns ok',
        'Do a solo test call to the VAPI number — note everything that sounds off, any missing responses, any flows that break. Write it all down.',
        'Fix as many issues from the test call as you can today',
        'Leave clear notes on what\'s still left to fix Monday',
      ],
      openclaw: [
        'Running',
        'Saturday morning nudges sent to leads who went quiet mid-week',
      ],
    },
  },
  {
    day: 5, date: '2026-06-07', label: 'Sun 7 Jun', week: 1,
    focus: 'Build the aesthetics prospect list + think about Week 2 angle',
    tasks: {
      you: [
        'Spend 1 hour on Instagram building your aesthetics clinic prospect list. Manchester, Leeds, Liverpool. Look for: 500-5000 followers, active posting, booking link in bio. Build a list of 20 with name, handle, city, treatments offered, whether they already have a booking system.',
        'Review your TikTok — views, comments, followers gained. What\'s the one thing you\'d do differently on the next one?',
        'Write your Week 2 messaging angle — what haven\'t you tried yet? Google visibility? Looking more professional than the competition? Picking up more customers? Pick one angle and build Week 2 around it.',
        'Day off from DMs — but check Baz alerts morning and evening. If a barber is ready to pay, you respond yourself, today.',
      ],
      me: [
        'Nothing unless something breaks — automated systems run themselves today',
      ],
      friend: [
        'Sign up for VAPI.ai free trial and set up the Sophie assistant',
        'Use Claude Code to hit the setup endpoint on the deployed aesthetics backend — get the assistant configured',
        'Do a proper 10-minute test call: book an appointment, ask about prices, ask something completely off-script. Write down every gap.',
        'Fix everything you can before Monday — leave a clear list of what\'s still broken',
      ],
      openclaw: [
        'Running — quiet mode, monitoring inbound only',
        'No proactive messages today unless a lead replies directly',
      ],
    },
  },
  {
    day: 6, date: '2026-06-08', label: 'Mon 8 Jun', week: 1,
    focus: 'SIMs arrive — warm them up + plan your closing moves',
    tasks: {
      you: [
        'Set up WhatsApp on each new SIM — text 10 real people from each number first (friends, family). The number needs to look human before outreach. Don\'t message barbers until tomorrow.',
        'Spend 30 minutes reading every reply thread in full — the whole conversation, not just the last message. For each warm lead: what do they actually want, what\'s their blocker, what\'s your exact next move with them?',
        'Instagram outreach (45 min) — 15 DMs, new city.',
        'Go back to your 5 warmest leads with a completely different angle — if they asked about price, lead with value. If they went quiet after the preview, ask what put them off.',
        'Write out your 3 main objection responses in full and say them out loud. You need to sound natural if someone calls you.',
      ],
      me: [
        'Deploy the 2 new opener variants live',
        'Update Baz\'s AGENTS.md with responses to any new objections Dylan identified',
        'Check the enricher found Instagram handles and emails for the Facebook Groups leads',
      ],
      friend: [
        'Fix everything from Sunday\'s VAPI test that you didn\'t get to — all of it',
        'Use Claude Code to wire up real Cal.com availability checking — not mocked, actual live availability',
        'Send 15 manual DMs',
        'Update the aesthetics landing page with Dylan\'s feedback from Friday',
        'Check Railway logs for overnight errors — fix anything that failed silently',
      ],
      openclaw: [
        'Running with updated playbook from Dylan\'s objection research',
        'Monday 9am outreach batch running on schedule',
      ],
    },
  },
  {
    day: 7, date: '2026-06-09', label: 'Tue 9 Jun', week: 1,
    focus: 'Full Week 1 stocktake — know your numbers cold',
    tasks: {
      you: [
        'Sit with the dashboard for 30 minutes. Write down every number: total outreach sent, total replies, reply rate %, warm conversations active, previews sent, deposits paid. This is your Week 1 baseline — you\'ll compare against it every week.',
        'List your 5 warmest leads with their current status and their specific blocker. Message each one personally today — different approach for each, targeting their exact blocker.',
        'Instagram outreach (45 min) — 15 DMs',
        'Post TikTok #2 — honest Week 1 recap. Show the real numbers even if they\'re not impressive. Talk about what you\'re learning. Authenticity beats polish on TikTok every time.',
        'What\'s the most common objection you\'re hearing? Write 3 different ways to handle it, say each one out loud, pick whichever sounds most natural. That\'s your Week 2 script.',
      ],
      me: [
        'Full stats report — reply rates by opener variant, by city, by day of week. Clear recommendation on what to cut and what to scale.',
        'Identify the 10 leads most likely to convert this week based on engagement signals — surface them at the top of the leads dashboard',
        'Kill any A/B variants underperforming vs the control',
      ],
      friend: [
        'Review the aesthetics landing page as if you\'ve never seen it — would a clinic owner understand it in 10 seconds? Change whatever doesn\'t work. Then stop tweaking.',
        'Use Claude Code to add a lead capture form — name, clinic name, phone number. Emails Dylan immediately when someone submits.',
        'Send 15 DMs — you should be at 100+ total by now',
        'Write a 1-page honest summary of everything built in Week 1: what\'s live, what works, what\'s broken, what\'s still to build',
      ],
      openclaw: [
        'Running',
        'Week 1 stats compiled and sent to Dylan at 8am',
      ],
    },
  },
  {
    day: 8, date: '2026-06-10', label: 'Wed 10 Jun', week: 2,
    focus: 'New SIMs active + personal closing push on warm leads',
    tasks: {
      you: [
        'New SIMs warmed up — start outreach on them today. 10 messages from each new number, 6-minute gaps. Check the logs show they sent without error.',
        'Message your 5 warmest leads personally — specific to each person\'s last message. Push for a yes or a no. "What\'s the sticking point? Happy to sort anything." A maybe wastes your time.',
        'Instagram outreach (45 min) — 15 DMs',
        'Film TikTok #3 — "showing a barber their free preview for the first time." Film your screen reacting to a real preview site. 60 seconds. Don\'t overthink it.',
        'For each warm lead: what is the ONE thing that would make them say yes today? Plan your specific next move for each person.',
      ],
      me: [
        'Review aesthetics AI deployment — is the full call flow connected? Does every step work end to end?',
        'Write Sophie\'s opening script — the first 30 seconds of a call need to immediately make a clinic owner think "this is actually useful"',
        'Flag any barber leads that have been "interested" 5+ days without moving — bring them to the top so Dylan sees them',
        'Check all cron jobs ran correctly overnight',
      ],
      friend: [
        'Full end-to-end test call on aesthetics AI — book a real appointment, verify Cal.com updated, verify Stripe payment link sent',
        'Test all edge cases: 16-year-old asking for Botox (must refuse), blood thinner question (must redirect to clinic), call under 10 seconds (hang-up handling)',
        'Fix every single failure. Log what you fixed and what\'s still outstanding.',
        'Verify clinic owner gets a WhatsApp notification every time a call comes in — test it works',
      ],
      openclaw: [
        'Running',
        'Week 2 follow-up sequences triggered for leads that went cold in Week 1',
      ],
    },
  },
  {
    day: 9, date: '2026-06-11', label: 'Thu 11 Jun', week: 2,
    focus: 'Aesthetics outreach starts — both channels running',
    tasks: {
      you: [
        'Send your first 5 aesthetics clinic DMs. Personalise each one — mention a specific treatment or something from their bio. Message: "Built an AI receptionist for aesthetics clinics — takes bookings 24/7, chases no-shows, refuses anything that needs medical opinion. Happy to do a 5-minute demo if you\'re curious?"',
        'Instagram barber session (45 min) — 15 DMs, keep this running in parallel',
        'Follow up personally on any barber lead that\'s been warm 5+ days with no movement — push for a decision',
        'Research what AI receptionist competitors charge — Recept AI, Synthflow, etc. Where does your pricing sit vs theirs?',
        'Go through every reply from the last 48h and categorise each conversation. Who is genuinely hot right now?',
      ],
      me: [
        'Fix any remaining bugs from friend\'s end-to-end test',
        'Verify WhatsApp clinic owner alerts fire correctly on every incoming call — test it',
        'Retire all but the top 2 barber opener variants',
        'Pull enricher stats: how many leads have verified emails and Instagram handles?',
      ],
      friend: [
        'DM 5 aesthetics clinics from Dylan\'s list — pick 5 he hasn\'t messaged. Split the list properly, no doubling up.',
        'Use Claude Code to build the clinic dashboard: bookings today, calls handled, no-shows, revenue recovered from follow-ups. Needs to look good enough to show a real clinic owner.',
        'Send 15 barber DMs',
        'Fix any outstanding issues from yesterday\'s edge case tests',
        'Write a one-liner for the aesthetics AI that any clinic owner would understand immediately — no jargon',
      ],
      openclaw: [
        'Running',
        'Aesthetics clinic follow-up sequences configured for non-replies',
      ],
    },
  },
  {
    day: 10, date: '2026-06-12', label: 'Fri 12 Jun', week: 2,
    focus: 'Closing push on barbers + the cold DM TikTok',
    tasks: {
      you: [
        'Follow up on all aesthetics clinic DMs from yesterday. Anyone who hasn\'t replied gets a different angle: "What happens when someone calls to book at 9pm and you\'re closed? That\'s the problem it solves."',
        'Check your warmest barber leads — who is genuinely closest to paying? Message 2 of them with a closer: "Happy to drop the first month free if you want to get it live this week."',
        'Instagram outreach (45 min) — 15 DMs',
        'Film TikTok #4 — "How I get barbers to reply to cold DMs at 17." Show a real reply thread with the number blanked. Talk through what you actually say and why it works. This one should do serious numbers.',
        'DM 5 more aesthetics clinics — you need 10 total in the pipeline between you and friend by end of today.',
      ],
      me: [
        'Improve the aesthetics AI system prompt based on all the edge case test findings — fill every gap in FAQ handling',
        'Check the barber dashboard is showing live accurate data — fix anything stale',
        'Write 2 new barber opener variants with a completely different angle from what\'s been tested',
      ],
      friend: [
        'Follow up on your 5 aesthetics clinic DMs — different message from yesterday',
        'Use Claude Code to build SMS appointment reminders — 24h before and 2h before each booking. Test one fires correctly all the way through.',
        'Send 15 barber DMs',
        'Write up the full aesthetics AI feature list honestly: what\'s live and working, what\'s half-built, what\'s still planned',
        'If the clinic dashboard looks good — screenshot it. That\'s going in the sales pitch.',
      ],
      openclaw: [
        'Running',
        'Friday batch of follow-ups sent to leads silent 72h+',
      ],
    },
  },
  {
    day: 11, date: '2026-06-13', label: 'Sat 13 Jun', week: 2,
    focus: 'Content day — double the audience',
    tasks: {
      you: [
        'Post TikTok #5 — "Building a web design agency at 17 from my bedroom, week 2 update." Show the dashboard, show a preview site, be honest about the journey. This type of video compounds over time.',
        'Reply to every comment on every TikTok you\'ve posted today — not just the new one. The algorithm rewards engagement in the first few hours.',
        'Post 3 Instagram stories: one showing the live dashboard, one showing a preview site being built, one with a poll — "Do you know a barber with no website?" Free leads.',
        'Message your 3 hottest leads personally — weekend messages get read more than weekday ones.',
        'Calculate your total pipeline value: warm conversations × £75 deposit. What\'s the realistic best case this week if 20% convert?',
      ],
      me: [
        'Generate the full Week 2 mid-point stats summary — have it ready for Dylan',
        'Fix any bugs that come up over the weekend',
      ],
      friend: [
        'Post TikTok #6 — "Helping my mate build an AI business at 17, here\'s what we actually made." Different angle, different audience. You\'ll reach people Dylan\'s account never would.',
        'Reply to every comment on your TikTok within the first 2 hours',
        'Use Claude Code to build the no-show recovery flow — when a client doesn\'t show, auto-text them within 2 hours to rebook. Test it works end to end.',
        'Send 10 barber DMs — lighter Saturday, but keep the habit going',
        'Honest question: if a clinic owner replied right now asking to see the product — could you demo it? Yes or no. If no, what\'s the one thing blocking it?',
      ],
      openclaw: [
        'Running',
        'Weekend mode — monitoring inbound, no proactive outreach',
      ],
    },
  },
  {
    day: 12, date: '2026-06-14', label: 'Sun 14 Jun', week: 2,
    focus: 'Rest — but think hard about what\'s actually working',
    tasks: {
      you: [
        'Genuine day off — but check Baz alerts morning and evening. If someone is ready to pay, you respond yourself today.',
        'Write a real reflection — not a list, an actual paragraph. What did you expect this to look like vs what actually happened? What would you tell yourself on Day 1?',
        'Go through your WhatsApp threads and find the 3 conversations where you felt closest to closing but it fell apart. What was the exact moment it slipped? What would you say differently?',
        'Think about Week 3 strategy — more outreach volume, better conversion on existing warm leads, or push harder on aesthetics? Pick one priority.',
      ],
      me: [
        'Nothing — systems run themselves today',
        'Automated Sunday health check on all cron jobs',
      ],
      friend: [
        'Day off — but think about the aesthetics AI pitch. If a clinic owner asked "why use this instead of just hiring a part-time receptionist?" — what\'s your answer?',
        'Look at the landing page with fresh eyes after a day away. What still isn\'t clear? Make a note.',
        'Write down your top 3 feature ideas that would genuinely make a clinic choose the AI over a human — not what\'s easy to build, what would actually matter to the owner.',
      ],
      openclaw: [
        'Running — quiet mode',
        'No proactive messages today',
      ],
    },
  },
  {
    day: 13, date: '2026-06-15', label: 'Mon 15 Jun', week: 2,
    focus: 'Final push — close what you can, demo what\'s ready',
    tasks: {
      you: [
        'Follow up on all aesthetics clinic DMs — yours and friend\'s. Anyone still not replied gets one final message: "Happy to send a 2-minute voice note showing exactly how it works if that\'s easier than a call?"',
        'Find 5 more clinics and message them today — keep the pipeline moving',
        'Instagram outreach (45 min) — 15 barber DMs',
        'Make actual phone calls to your 2 warmest barber leads. Text first: "Mind if I give you a quick call about the preview?" A 2-minute call closes faster than 10 more messages.',
        'Work out your June revenue target: how many deposits to hit £500? At your current close rate, how many conversations does that take? What do you need to change?',
        'Check all 5 TikTok analytics — which video got the most reach and why? Apply that one lesson to your next video.',
      ],
      me: [
        'Draft pricing recommendation for aesthetics AI — what to charge per clinic and why',
        'Write the 3-sentence aesthetics AI sales pitch — clear enough that friend can say it cold on a phone call without notes',
        'Pull all data for tomorrow\'s final review — have the full 2-week numbers ready',
        'Check barber platform health — any overnight issues or stuck jobs',
      ],
      friend: [
        'Use Claude Code to build the monthly ROI report — generates a WhatsApp summary to the clinic owner showing: calls handled, bookings made, no-shows chased, revenue recovered. Verify it actually sends.',
        'DM 5 more aesthetics clinics',
        'Send 15 barber DMs',
        'If the aesthetics AI is demo-ready — have your demo prepared. Phone number ready, know what you\'re saying, know the 3 things you want them to see. Practise it once.',
        'Fix any final platform bugs — today is your last proper build day before the review',
      ],
      openclaw: [
        'Running',
        'Monday 9am outreach batch confirmed running',
      ],
    },
  },
  {
    day: 14, date: '2026-06-16', label: 'Tue 16 Jun', week: 2,
    focus: '2-week review — make the decision on what\'s next',
    tasks: {
      you: [
        'Write down every number from the 2 weeks: total outreach sent across all channels, total replies, reply rate %, warm leads active right now, deposits paid, TikTok views total, aesthetics clinic conversations started. Real numbers only.',
        'Make the call: double down on barbers, push aesthetics harder, or run both in parallel? Write your reasoning in 3 sentences. This is your Week 3 direction.',
        'Message your 3 hottest remaining leads one final time — personal, specific, closing push. If they say no today, let them go.',
        'Post TikTok #7 — "2 weeks building this at 17, here\'s what actually happened." Be fully honest. This is your most important video because it\'s real.',
        'Message me with your Week 3 decision — I\'ll build the plan around it',
      ],
      me: [
        'Full 2-week performance review — all channels, what worked, what to cut, what to scale',
        'Draft Week 3 plan based on real results — ready to share with Dylan',
        'Identify the 15 highest-priority leads for Dylan\'s personal outreach push next week',
        'Send Dylan the full summary so he has everything in one place',
      ],
      friend: [
        'Is the aesthetics AI demo-ready right now? If yes — contact a real clinic today and show them. If no — write down the single thing blocking it and fix it.',
        'Review together: which DMs got the best response rate between the two of you? What was different about the ones that worked?',
        'Use Claude Code to write up a complete build summary — what\'s live, what works, what the next sprint should cover',
        'Write your 3-sentence aesthetics AI pitch — say it out loud until it sounds natural. That\'s your script for real clinic calls next week.',
        'Write down which 5 aesthetics clinics you\'re calling this week. Have the list ready before tonight.',
      ],
      openclaw: [
        'Running',
        '2-week stats summary sent to Dylan at 8am',
      ],
    },
  },
]

const PEOPLE = [
  { key: 'you',      label: 'You',      color: C.gold,    panelBg: 'rgba(212,168,67,0.05)',   panelBorder: 'rgba(212,168,67,0.18)'   },
  { key: 'me',       label: 'Claude',   color: C.cyan,    panelBg: 'rgba(0,212,255,0.04)',    panelBorder: 'rgba(0,212,255,0.18)'    },
  { key: 'friend',   label: 'Friend',   color: '#a855f7', panelBg: 'rgba(168,85,247,0.05)',   panelBorder: 'rgba(168,85,247,0.18)'   },
  { key: 'openclaw', label: 'OpenClaw', color: C.green,   panelBg: 'rgba(0,255,136,0.04)',    panelBorder: 'rgba(0,255,136,0.18)'    },
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
        <p className="text-white/40 text-sm">3 Jun – 16 Jun 2026 · First sale target · Click a day to expand — click any task to tick it off</p>
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
