# L&D Designs — AI Agency Platform

A fully automated web design agency platform for targeting local UK barber shops.

**Built for:** Dylan Townley · L&D Designs  
**Stack:** Python + FastAPI · React + Tailwind · Supabase · OpenAI · Gmail SMTP · Twilio

---

## What This Does

1. **Finds barber shops** with no website across 30 UK cities (automated daily)
2. **Analyses website quality** to score and prioritise leads
3. **Generates personalised preview websites** — a real barber site with their name, city, and details
4. **Writes personalised cold outreach** (email + SMS) using AI that sounds like a real human
5. **Sends outreach** with daily limits and rate limiting to avoid spam flags
6. **Follows up automatically** — Day 1, 3, 7, and 14
7. **Alerts you instantly** when a lead replies
8. **Dashboard** to see everything at a glance and approve messages before they send

**Monthly cost:** ~£5–10 (backend hosting) + £0.001 per AI outreach message

---

## Quick Setup (Step by Step)

### Step 1 — Set Up Supabase (Free)

1. Go to [supabase.com](https://supabase.com) → Create new project
2. Wait ~2 minutes for it to provision
3. Click **SQL Editor** in the left sidebar
4. Paste the entire contents of `backend/db/migrations.sql`
5. Click **Run** — your database is ready
6. Go to **Settings → API** and copy:
   - Project URL → `SUPABASE_URL`
   - `service_role` key → `SUPABASE_SERVICE_KEY`

### Step 2 — Get Your OpenAI API Key

1. Go to [platform.openai.com](https://platform.openai.com)
2. Click **API Keys → Create new secret key**
3. Copy it → `OPENAI_API_KEY`
4. Add £5 credit (will last months at this usage level)

### Step 3 — Set Up Gmail App Password

1. Go to [myaccount.google.com](https://myaccount.google.com) → **Security**
2. Enable **2-Step Verification** if not already on
3. Search for **App Passwords** → Create one called `L&D Platform`
4. Copy the 16-character password → `GMAIL_APP_PASSWORD`

### Step 4 — Set Up Twilio SMS (Optional)

> Skip this if you only want email outreach. Email is free.

1. Go to [twilio.com](https://twilio.com) → Sign up (free trial = £15 credit)
2. Get a UK phone number (~£1/month)
3. Copy: Account SID → `TWILIO_ACCOUNT_SID`
4. Copy: Auth Token → `TWILIO_AUTH_TOKEN`
5. Copy: Your phone number → `TWILIO_FROM_NUMBER`

### Step 5 — Configure the Backend

```bash
# In the platform/backend folder:
cp .env.example .env
```

Open `.env` and fill in all the values from the steps above.

### Step 6 — Run the Backend Locally

```bash
cd platform/backend

# Create a virtual environment (one-time setup)
python -m venv venv

# Activate it
source venv/bin/activate      # Mac/Linux
# or on Windows:
venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Install Playwright browsers (for scraping)
playwright install chromium

# Start the backend
uvicorn main:app --reload
```

The API is now running at `http://localhost:8000`  
Interactive docs: `http://localhost:8000/docs`

### Step 7 — Run the Frontend Locally

```bash
cd platform/frontend

# Install dependencies (one-time)
npm install

# Start the dev server
npm run dev
```

Dashboard is now at `http://localhost:5173`

---

## Deploying to Production

### Backend → Railway (Free tier available)

1. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
2. Select your repo → set **Root Directory** to `platform/backend`
3. Add all your environment variables (copy from `.env`)
4. Railway will auto-detect Python and deploy
5. Copy the deployment URL (e.g. `https://ld-platform.railway.app`)

### Frontend → Vercel (Free)

1. Go to [vercel.com](https://vercel.com) → New Project → Import your GitHub repo
2. Set **Root Directory** to `platform/frontend`
3. Add environment variable: `VITE_API_URL=https://your-backend.railway.app/api`
4. Update `platform/vercel.json` with your Railway URL
5. Deploy

---

## Daily Workflow (1–2 hours/day)

The system runs mostly automatically. Your job:

1. **Morning** — Open the dashboard, check notifications
2. **Review queue** — Go to Outreach → approve/reject AI-written messages
3. **Hot leads** — Any "Replied" or "Interested" leads need your personal attention
4. **Log replies** — If someone replies on WhatsApp, log it in the lead's page

That's it. The AI handles finding, analysing, writing, sending, and following up.

---

## The Outreach Workflow

```
New Lead Added
     ↓
Website Analyzer (automatic, twice daily)
     ↓
Preview Generator (creates their "free" barber website)
     ↓
Outreach Writer (AI writes personalised email/SMS)
     ↓
QC Agent (validates quality — blocks bad messages)
     ↓
Your Approval (you approve in the dashboard)
     ↓
Outreach Sender (sends via Gmail/Twilio)
     ↓
Follow-Up Agent (Day 3, 7, 14 automatically)
     ↓
Notification Agent (alerts you when they reply)
     ↓
You close the deal 💰
```

---

## Pricing Strategy

| Package | Price | What's included |
|---------|-------|-----------------|
| Starter | £149  | 1-page site, mobile-friendly, contact form |
| Standard | £249 | 5-page site, services, gallery, map |
| Premium | £399 | Everything + WhatsApp booking, reviews, SEO |

**No monthly fees** — this is your biggest selling point vs agencies.

---

## Tips for Getting First Client

1. **Start with 20 emails/day** — don't blast 500 at once
2. **The preview website is your best tool** — "I already built you a free site" is incredibly powerful
3. **Personalise follow-ups** — if you see their Google rating, mention it
4. **Reply FAST** — when a lead replies, respond within 1 hour
5. **WhatsApp > Email** for closing — once they reply, take it to WhatsApp
6. **Barbers talk to each other** — one happy client can get you 3 referrals

---

## File Structure

```
platform/
├── backend/
│   ├── main.py              ← FastAPI app entry point
│   ├── config.py            ← Settings from .env
│   ├── requirements.txt     ← Python dependencies
│   ├── .env.example         ← Copy to .env and fill in
│   ├── agents/
│   │   ├── lead_finder.py   ← Scrapes Yell.com for barbers
│   │   ├── website_analyzer.py  ← Checks site quality
│   │   ├── preview_generator.py ← Builds personalised sites
│   │   ├── outreach_writer.py   ← AI writes messages
│   │   ├── qc_agent.py      ← Validates before sending
│   │   ├── outreach_sender.py   ← Gmail + Twilio
│   │   ├── followup_agent.py    ← Day 3/7/14 sequences
│   │   └── notification_agent.py ← Alerts you on replies
│   ├── api/                 ← API route handlers
│   ├── db/
│   │   ├── client.py        ← Supabase connection
│   │   └── migrations.sql   ← Run this in Supabase SQL Editor
│   ├── models/schemas.py    ← Data models
│   ├── templates/barber_site.html  ← The preview website template
│   └── tasks/scheduler.py  ← Runs agents on a schedule
├── frontend/
│   └── src/
│       ├── pages/           ← Dashboard, Leads, Outreach, Previews
│       └── components/      ← Reusable UI components
├── .gitignore
└── vercel.json              ← Vercel deployment config
```

---

## Troubleshooting

**Backend won't start:**
- Check `.env` exists and has `SUPABASE_URL` and `OPENAI_API_KEY` set
- Make sure you ran `pip install -r requirements.txt`
- Try `python -c "from config import settings; print(settings.SUPABASE_URL)"` to test

**Emails not sending:**
- Check `GMAIL_APP_PASSWORD` is the App Password (16 chars), not your real password
- Make sure 2FA is enabled on your Google account

**Supabase errors:**
- Make sure you ran the migrations SQL first
- Use the `service_role` key (not `anon` key) in `.env`

**Rate limit errors:**
- You hit the daily email limit (default 50)
- Wait until midnight or increase `MAX_EMAILS_PER_DAY` in `.env`

---

*Built by Claude for Dylan Townley · L&D Designs · Wigan, UK*
