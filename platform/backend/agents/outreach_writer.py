"""
Outreach Writer Agent
Uses OpenAI GPT-4o-mini to write personalized cold outreach.
Tone: friendly, casual, UK local. Never sounds like AI or a corporation.
Cost: ~£0.001 per message (incredibly cheap with gpt-4o-mini).
"""
import logging
from openai import OpenAI
from config import settings

logger = logging.getLogger(__name__)

client = OpenAI(api_key=settings.OPENAI_API_KEY)

SYSTEM_PROMPT = """You are Dylan, a 17-year-old web designer from Wigan, UK.
You write short outreach messages to local barber shops that don't have a proper website.

Your tone:
- Friendly and casual, like a local lad
- Never corporate or salesy
- Short and to the point
- Use natural UK phrasing (not American)
- Never use exclamation marks more than once
- Never say "I hope this message finds you well" or similar clichés
- Sound human, not like AI

Your pitch is simple — focus ONLY on:
- Getting more bookings
- Customers being able to find them online easily
- Looking more professional
- Being mobile-friendly so people on their phones can find and book them

NEVER mention: SEO, Lighthouse scores, website analysis, tech stack, metrics, or anything technical.

Your offer:
- You build websites for barbers
- £150 to build, then £15/month for hosting and updates
- Quick turnaround (a few days)
- You handle everything — they just give you info and approve it
- Customers can book directly, find opening hours, see services
- They show up on Google "barber near me" searches
- Tap-to-book/call button for mobile customers
- Looks more professional than competitors with no site

Always mention the preview website link if provided."""

WHATSAPP_SYSTEM_PROMPT = """You are Dylan, a 17-year-old lad from Wigan texting a local barber shop.

The message should always follow this structure and feel:
- Start with "Hiya mate"
- Say your name is Dylan
- Say you were looking for barbers nearby and noticed they didn't have a website
- Say you built them a free preview to have a look at
- Drop the preview link
- End with something like "let me know what you think" or "lmk if you want it live"
- Sign off as Dylan

Keep it to 3-4 lines. Natural, friendly, like a genuine text from a real person.
Never sound salesy. No corporate language. No exclamation marks except at most one.
Vary it slightly each time so it doesn't sound copy-pasted."""


def _write_email(lead: dict, preview_url: str | None = None, sequence_day: int = 1) -> dict:
    """Write a personalized outreach email."""
    name = lead.get("business_name", "the barbers")
    city = lead.get("city", "your area")
    rating = lead.get("google_rating")
    reviews = lead.get("google_reviews")

    # Build context for the AI
    context_parts = [f"Business: {name}", f"City: {city}"]
    if rating:
        context_parts.append(f"Google rating: {rating}/5 ({reviews} reviews)")
    if preview_url:
        context_parts.append(f"Preview website URL: {preview_url}")

    if sequence_day == 1:
        instruction = (
            "Write an initial cold outreach EMAIL to this barber shop. "
            "Keep it under 100 words. Mention you noticed they don't have a proper website. "
            "Mention the preview if a URL is provided. "
            "End with a simple call to action (reply to this email or WhatsApp). "
            "Include a subject line on the first line in format: Subject: ..."
        )
    elif sequence_day == 3:
        instruction = (
            "Write a SHORT follow-up email (50 words max). "
            "Reference the previous message. Keep it casual. "
            "No pressure. Just a gentle nudge. "
            "Include a subject line on the first line in format: Subject: ..."
        )
    elif sequence_day == 7:
        instruction = (
            "Write a second follow-up email (40 words max). "
            "Keep it super short and casual. "
            "Maybe mention that the preview site is still available if they want to see it. "
            "Include a subject line on the first line in format: Subject: ..."
        )
    else:  # day 14, final
        instruction = (
            "Write a final follow-up email (30 words max). "
            "This is the last message. Say you'll leave them to it but they can always get in touch. "
            "Friendly, no hard feelings tone. "
            "Include a subject line on the first line in format: Subject: ..."
        )

    prompt = f"""
Business details:
{chr(10).join(context_parts)}

Task: {instruction}
"""

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            max_tokens=300,
            temperature=0.85,
        )

        raw = response.choices[0].message.content.strip()

        # Parse subject line
        lines = raw.split("\n")
        subject = f"Quick question about {name}'s website"
        body_lines = []
        for i, line in enumerate(lines):
            if line.lower().startswith("subject:"):
                subject = line.replace("Subject:", "").replace("subject:", "").strip()
            else:
                body_lines.extend(lines[i:])
                break

        body = "\n".join(body_lines).strip()
        if not body:
            body = raw

        return {"subject": subject, "body": body}

    except Exception as e:
        logger.error(f"OpenAI email write failed: {e}")
        # Fallback template
        return _fallback_email(name, city, preview_url, sequence_day)


def _write_sms(lead: dict, preview_url: str | None = None, sequence_day: int = 1) -> str:
    """Write a personalized SMS message (160 char limit awareness)."""
    name = lead.get("business_name", "the shop")
    city = lead.get("city", "your area")

    if sequence_day == 1:
        instruction = (
            f"Write a very short SMS (under 160 chars) to {name} in {city}. "
            "Casual, friendly UK tone. Mention you've built them a free preview website. "
            f"{'Include this link: ' + preview_url if preview_url else ''} "
            "Sign off as Dylan."
        )
    else:
        instruction = (
            f"Write a very short follow-up SMS (under 120 chars) to {name}. "
            "Gentle nudge. Casual. Sign off as Dylan."
        )

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": instruction},
            ],
            max_tokens=100,
            temperature=0.85,
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        logger.error(f"OpenAI SMS write failed: {e}")
        return _fallback_sms(name, preview_url)


def _fallback_email(name: str, city: str, preview_url: str | None, day: int) -> dict:
    """Fallback if OpenAI fails — pre-written templates."""
    if day == 1:
        subject = f"Quick question about {name}'s website"
        body = (
            f"Hiya,\n\n"
            f"I noticed {name} doesn't have a proper website yet.\n\n"
            f"I build websites for local barbers — £150 to build, then £15/month for hosting and updates. "
            f"I handle everything start to finish.\n\n"
        )
        if preview_url:
            body += f"I've actually made a free preview of what yours could look like: {preview_url}\n\n"
        body += (
            f"If you're interested in getting more bookings online, just reply here or WhatsApp me on "
            f"{settings.FOUNDER_PHONE}.\n\nCheers,\nDylan\nL&D Designs"
        )
    else:
        subject = f"Re: {name}'s website"
        body = (
            f"Hi again,\n\nJust checking you got my last message about a website for {name}? "
            f"No worries if not the right time — just happy to help if you ever need it.\n\n"
            f"Cheers, Dylan"
        )
    return {"subject": subject, "body": body}


def _fallback_sms(name: str, preview_url: str | None) -> str:
    msg = f"Hi, I'm Dylan from L&D Designs. I've built a free website preview for {name}."
    if preview_url:
        msg += f" Have a look: {preview_url}"
    msg += f" Reply or WhatsApp {settings.FOUNDER_PHONE} if interested!"
    return msg


# A/B test templates — 5 variants, rotated in order for even distribution.
# Variant index is stored in the message body's first word pattern so reply rate
# can be calculated per variant later via /api/outreach/template-stats.
_WHATSAPP_TEMPLATES = [
    # V1 — short hook
    "Hey, you the owner of {name}? Got a quick idea for getting you more bookings — worth a message?",
    # V2 — personal intro + preview link (best hypothesis; {preview_suffix} is ": <url>" or "")
    "Hiya {name} — I'm Dylan, I build websites for barbers. I've already put a free preview together of what yours could look like{preview_suffix}. No strings — just let me know if you want it live",
    # V3 — social proof + preview link
    "Hey, came across {name} — I build websites for barbers and I've already made a free preview for yours{preview_suffix}. Reply if you want a look, happy to send it over",
    # V4 — simple question
    "Hi, came across {name} in {city} — do you have a website? I build them for local barbers, just wondering if it's something you'd want.",
    # V5 — curiosity hook
    "Hey, you the owner of {name}? Got something that might help get more customers through the door — worth a quick chat?",
]

import random as _random

def _write_whatsapp(lead: dict, preview_url: str | None = None, variant_index: int | None = None) -> str:
    name = lead.get("business_name", "your shop")
    city = lead.get("city", "your area")
    if preview_url and "localhost" in preview_url:
        preview_url = None
    idx = variant_index % len(_WHATSAPP_TEMPLATES) if variant_index is not None else _random.randrange(len(_WHATSAPP_TEMPLATES))
    # V2 and V3 embed the preview URL directly; others don't reference it
    preview_suffix = f": {preview_url}" if preview_url else ""
    return _WHATSAPP_TEMPLATES[idx].format(name=name, city=city, preview_suffix=preview_suffix)


def generate_whatsapp_campaign(limit: int = 50) -> dict:
    """
    Generate WhatsApp messages for preview_ready leads with mobile numbers.
    Stored as queued outreach messages — Dylan clicks the wa.me link to send manually.
    """
    from db.client import get_db
    db = get_db()

    result = (
        db.table("leads")
        .select("*")
        .eq("status", "preview_ready")
        .limit(limit)
        .execute()
    )
    # Only leads with a UK mobile number — landlines won't work on WhatsApp
    def _is_mobile(phone: str) -> bool:
        p = phone.replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
        return p.startswith("07") or p.startswith("+447") or p.startswith("447")

    leads = [l for l in (result.data or []) if l.get("phone") and _is_mobile(l["phone"])]

    generated = 0
    skipped = 0
    variant_counter = 0

    for lead in leads:
        lead_id = lead["id"]
        try:
            # Skip only if already SENT to this lead via WhatsApp (not just queued)
            existing_sent = (
                db.table("outreach_messages")
                .select("id")
                .eq("lead_id", lead_id)
                .eq("channel", "whatsapp")
                .eq("status", "sent")
                .execute()
            )
            if existing_sent.data:
                skipped += 1
                continue

            # Delete any stale queued/approved WhatsApp messages so we can regenerate fresh
            db.table("outreach_messages").delete().eq("lead_id", lead_id).eq("channel", "whatsapp").in_("status", ["queued", "approved"]).execute()

            preview_result = (
                db.table("previews")
                .select("preview_url")
                .eq("lead_id", lead_id)
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            preview_url = preview_result.data[0]["preview_url"] if preview_result.data else None

            # Only include preview URL if it's the DB-served format pointing to a public host
            if preview_url and ("/previews/serve/" not in preview_url or "localhost" in preview_url):
                preview_url = None

            body = _write_whatsapp(lead, preview_url, variant_index=variant_counter)
            variant_counter += 1

            db.table("outreach_messages").insert({
                "lead_id": lead_id,
                "channel": "whatsapp",
                "direction": "outbound",
                "body": body,
                "status": "queued",
                "sequence_day": 1,
                "ai_generated": False,
                "approved_by_founder": True,
            }).execute()

            db.table("leads").update({"status": "outreach_queued"}).eq("id", lead_id).execute()

            generated += 1

        except Exception as e:
            logger.error(f"WhatsApp generation failed for lead {lead_id}: {e}")

    logger.info(f"WhatsApp campaign: {generated} generated, {skipped} skipped")
    return {"generated": generated, "skipped": skipped}


def generate_outreach(
    lead: dict,
    channel: str = "email",
    preview_url: str | None = None,
    sequence_day: int = 1,
) -> dict:
    """
    Main public function.
    Returns {'subject': ..., 'body': ...} for email
    or {'body': ...} for SMS/WhatsApp.
    """
    if channel == "email":
        return _write_email(lead, preview_url, sequence_day)
    elif channel == "sms":
        body = _write_sms(lead, preview_url, sequence_day)
        return {"body": body}
    elif channel == "whatsapp":
        body = _write_whatsapp(lead, preview_url)
        return {"body": body}
    else:
        raise ValueError(f"Unknown channel: {channel}")


_INSTAGRAM_DM_TEMPLATES = [
    "Hey! Noticed {name} doesn't have a website yet — I build them for local barbers, £150 then £15/month hosting. Happy to put a free preview together if you fancy it? — Dylan",
    "Hi! Had a look for barbers nearby and saw {name} doesn't have a site. I do free website previews for barbers — want me to make one for you? — Dylan from Wigan",
    "Hey, I'm Dylan — I build websites for barbers. Noticed {name} doesn't have one yet, happy to put a free preview together. No catch, just reply if you want a look 👍",
    "Hi! I build websites for local barber shops — saw {name} doesn't have one. £150 to build, £15/month after, quick turnaround. Fancy a free preview? — Dylan",
    "Hey! Was looking for barbers near me and {name} came up without a website. I make free previews for barbers — no strings, just reply if you're interested. Cheers, Dylan",
]


def generate_instagram_campaign(limit: int = 50) -> dict:
    """
    Generate Instagram DM scripts for preview_ready leads that have an instagram_url.
    Stored as queued outreach_messages with channel='instagram' — copy only, not sent automatically.
    """
    from db.client import get_db
    db = get_db()

    # Fetch a wide batch and filter for instagram_url in Python
    result = (
        db.table("leads")
        .select("*")
        .eq("status", "preview_ready")
        .limit(limit * 4)
        .execute()
    )
    leads = [l for l in (result.data or []) if l.get("instagram_url")][:limit]

    generated = 0
    skipped = 0

    for lead in leads:
        lead_id = lead["id"]
        try:
            existing = (
                db.table("outreach_messages")
                .select("id")
                .eq("lead_id", lead_id)
                .eq("channel", "instagram")
                .in_("status", ["queued", "sent"])
                .execute()
            )
            if existing.data:
                skipped += 1
                continue

            name = lead.get("business_name", "your shop")
            body = _random.choice(_INSTAGRAM_DM_TEMPLATES).format(name=name)

            db.table("outreach_messages").insert({
                "lead_id": lead_id,
                "channel": "instagram",
                "direction": "outbound",
                "body": body,
                "status": "queued",
                "sequence_day": 1,
                "ai_generated": False,
                "approved_by_founder": True,
            }).execute()

            generated += 1

        except Exception as e:
            logger.error(f"Instagram DM generation failed for lead {lead_id}: {e}")

    logger.info(f"Instagram campaign: {generated} generated, {skipped} skipped")
    return {"generated": generated, "skipped": skipped}


def run_batch(limit: int = 50) -> dict:
    """Write outreach emails for leads that have a preview but no outreach yet."""
    from db.client import get_db
    from agents import qc_agent
    from config import settings

    db = get_db()

    # Get preview_ready leads that have a preview but no outreach queued yet
    result = (
        db.table("leads")
        .select("*")
        .eq("status", "preview_ready")
        .limit(limit)
        .execute()
    )
    leads = result.data or []

    generated = 0
    skipped = 0
    errors = 0

    for lead in leads:
        try:
            lead_id = lead["id"]

            # Skip if already has pending outreach (queued/approved/draft)
            existing = (
                db.table("outreach_messages")
                .select("id")
                .eq("lead_id", lead_id)
                .eq("direction", "outbound")
                .in_("status", ["queued", "approved", "draft"])
                .execute()
            )
            if existing.data:
                skipped += 1
                continue

            # Skip leads with no email address — can't send without one
            if not lead.get("email"):
                skipped += 1
                continue

            # Get preview URL
            preview_result = (
                db.table("previews")
                .select("preview_url")
                .eq("lead_id", lead_id)
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            preview_url = preview_result.data[0]["preview_url"] if preview_result.data else None

            content = generate_outreach(lead=lead, channel="email", preview_url=preview_url)

            qc = qc_agent.validate(
                channel="email",
                subject=content.get("subject"),
                body=content["body"],
                preview_url=preview_url,
                lead=lead,
            )

            if not qc["passed"]:
                errors += 1
                continue

            db.table("outreach_messages").insert({
                "lead_id": lead_id,
                "channel": "email",
                "direction": "outbound",
                "subject": content.get("subject"),
                "body": content["body"],
                "status": "queued",
                "sequence_day": 1,
                "ai_generated": True,
                "approved_by_founder": True,
            }).execute()

            db.table("leads").update({"status": "outreach_queued"}).eq("id", lead_id).execute()
            generated += 1

        except Exception as e:
            logger.error(f"Outreach batch failed for lead {lead.get('id')}: {e}")
            errors += 1

    logger.info(f"Outreach batch: {generated} generated, {skipped} skipped, {errors} errors")
    return {"generated": generated, "skipped": skipped, "errors": errors}
