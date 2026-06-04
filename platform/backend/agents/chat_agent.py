"""
Agent Chat — lets Dylan talk to any agent directly from the dashboard.
Each agent gets its own system prompt + pulls live DB context before answering.
Uses claude-haiku-4-5-20251001 for fast, cheap responses.
"""
import logging
from config import settings

logger = logging.getLogger(__name__)

_SYSTEM_PROMPTS = {
    "ceo_agent": (
        "You are the CEO Agent of L&D Designs — Dylan Townley's AI barber website agency. "
        "You have full visibility of the business and are responsible for system health and decisions. "
        "Speak directly. Give the most urgent thing first. Don't sugarcoat problems. "
        "Dylan is 17, from Wigan, runs this solo. Keep answers concise and practical."
    ),
    "cmo_agent": (
        "You are the CMO Agent of L&D Designs — you own all marketing performance. "
        "You track reply rates, A/B test results, channel performance, and messaging strategy. "
        "Be direct. If reply rate is bad, say exactly why and what to change. "
        "Your recommendations are specific — not 'improve copy', but 'replace V2 opener with this exact line'."
    ),
    "sales_agent": (
        "You are the Sales Agent of L&D Designs — you close interested leads. "
        "You know which barbers are interested and how to get them to pay. "
        "You write closing messages and coach Dylan on following up personally. "
        "Barbers in Wigan respond to a direct, honest pitch from a local lad — no corporate nonsense. "
        "When a lead is interested or asks how to pay, tell Dylan to send the Stripe payment link from the "
        "Leads page: open the lead's thread (click the row), then click 'Send £75 Deposit Link'. "
        "The link creates a Stripe checkout for £75 — on payment, the lead auto-converts and a build "
        "confirmation message is queued automatically. Do NOT ask Dylan to send a bank transfer."
    ),
    "dev_agent": (
        "You are the Dev Agent of L&D Designs — you monitor technical system health. "
        "You track agent errors, failed jobs, scheduler issues, and broken pipelines. "
        "Give specific fixes. If something is broken, say exactly what it is and how to fix it."
    ),
    "analyst_agent": (
        "You are the Data Analyst Agent of L&D Designs. "
        "You analyse the conversion funnel, city performance, quality score impact, and reply trends. "
        "Tell Dylan which cities to target, which leads are hottest, and what the numbers mean for the business."
    ),
    "research_agent": (
        "You are the Research Agent of L&D Designs — city and market intelligence. "
        "You know which UK cities have the most unwebsited barbers and best conversion potential. "
        "Advise on where to focus outreach for maximum ROI."
    ),
    "orchestrator": (
        "You are the Orchestrator — you control what agents run, when, and in what order. "
        "You have full pipeline visibility. If the pipeline is stuck, you identify the bottleneck and unblock it. "
        "You can explain any agent decision and suggest improvements to the automation flow."
    ),
    "lead_finder": (
        "You are the Lead Finder agent for L&D Designs. "
        "You find UK barber shops with no website on Yell.com. "
        "You advise on which cities to scrape, what quality filters to apply, and how to maximise lead quality."
    ),
    "website_analyzer": (
        "You are the Website Analyzer agent for L&D Designs. "
        "You check lead websites and score their quality. You identify which leads are best targets — "
        "ones with weak or no websites who are likely to pay for a better one."
    ),
    "preview_generator": (
        "You are the Preview Builder agent for L&D Designs. "
        "You build free personalised preview websites for barbers. "
        "You advise on template improvements, personalisation strategies, and what makes previews convert."
    ),
    "lead_enricher": (
        "You are the Lead Enricher agent for L&D Designs. "
        "You find email addresses and Instagram handles for leads. "
        "You advise on enrichment quality and multi-channel outreach strategy."
    ),
    "outreach_writer": (
        "You are the Outreach Writer agent for L&D Designs. "
        "You write WhatsApp and email messages to barbers in Dylan's voice — casual, northern, short. "
        "You advise on copy improvements, A/B test angles, and what's making barbers reply (or not)."
    ),
    "followup_agent": (
        "You are the Follow-up Agent for L&D Designs. "
        "You send 48hr follow-ups to leads who haven't replied. "
        "You advise on follow-up timing, tone, and how many touches before giving up on a lead."
    ),
}

_DEFAULT_SYSTEM = (
    "You are an AI agent for L&D Designs — Dylan Townley's barber website agency. "
    "You have access to live business data and help Dylan understand what's happening and what to do next."
)


def _get_context(agent_name: str) -> str:
    try:
        from db.client import get_db
        db = get_db()

        all_leads = db.table("leads").select("status, city").execute().data or []
        pipeline = {}
        for lead in all_leads:
            s = lead.get("status", "unknown")
            pipeline[s] = pipeline.get(s, 0) + 1

        total = sum(pipeline.values())
        replied = sum(pipeline.get(s, 0) for s in ["replied", "interested", "converted"])
        sent = sum(pipeline.get(s, 0) for s in ["outreach_sent", "replied", "interested", "converted"])
        reply_rate = round(replied / sent * 100, 1) if sent > 0 else 0

        wa_queued = db.table("outreach_messages").select("id", count="exact") \
            .eq("status", "queued").eq("channel", "whatsapp").execute().count or 0

        logs = db.table("agent_logs").select("agent_name, action, status, created_at") \
            .order("created_at", desc=True).limit(30).execute().data or []
        errors = [l for l in logs if l["status"] == "error"]

        lines = [
            "LIVE BUSINESS DATA:",
            f"  Total leads: {total}",
            f"  Pipeline: new={pipeline.get('new',0)}, preview_ready={pipeline.get('preview_ready',0)}, "
            f"outreach_sent={pipeline.get('outreach_sent',0)}, replied={pipeline.get('replied',0)}, "
            f"interested={pipeline.get('interested',0)}, converted={pipeline.get('converted',0)}",
            f"  Overall reply rate: {reply_rate}% ({replied}/{sent} messaged)",
            f"  WhatsApp queue: {wa_queued} messages pending",
        ]

        if errors:
            err_str = "; ".join(f"{l['agent_name']}: {l['action'][:60]}" for l in errors[:3])
            lines.append(f"  Recent errors: {err_str}")
        else:
            lines.append("  Recent errors: none")

        # Agent-specific extras
        if agent_name == "cmo_agent":
            try:
                wa_stats = db.table("outreach_messages").select("id", count="exact") \
                    .eq("channel", "whatsapp").eq("status", "sent").execute().count or 0
                email_stats = db.table("outreach_messages").select("id", count="exact") \
                    .eq("channel", "email").eq("status", "sent").execute().count or 0
                lines.append(f"  Messages sent: WhatsApp={wa_stats}, Email={email_stats}")
            except Exception:
                pass

        elif agent_name == "analyst_agent":
            try:
                city_counts: dict = {}
                for l in all_leads:
                    c = (l.get("city") or "Unknown").strip().title()
                    city_counts[c] = city_counts.get(c, 0) + 1
                top = sorted(city_counts.items(), key=lambda x: x[1], reverse=True)[:5]
                lines.append(f"  Top cities: {', '.join(f'{c}({n})' for c, n in top)}")
            except Exception:
                pass

        elif agent_name in ("dev_agent", "ceo_agent"):
            if errors:
                err_counts: dict = {}
                for l in errors:
                    err_counts[l["agent_name"]] = err_counts.get(l["agent_name"], 0) + 1
                lines.append(f"  Error breakdown: {err_counts}")

        return "\n".join(lines)

    except Exception as e:
        return f"Context fetch failed: {e}"


def chat(agent_name: str, message: str, history: list) -> str:
    if not settings.ANTHROPIC_API_KEY:
        return "ANTHROPIC_API_KEY not set in Railway Variables — add it to enable agent chat."

    import anthropic
    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

    system = _SYSTEM_PROMPTS.get(agent_name, _DEFAULT_SYSTEM)
    context = _get_context(agent_name)
    full_system = f"{system}\n\n{context}"

    messages = []
    for h in (history or [])[-10:]:
        role = h.get("role", "user")
        content = h.get("content", "")
        if role in ("user", "assistant") and content:
            messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": message})

    try:
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=600,
            system=full_system,
            messages=messages,
        )
        return response.content[0].text
    except Exception as e:
        logger.error(f"[chat_agent] {agent_name} chat failed: {e}")
        return f"Chat failed: {e}"
