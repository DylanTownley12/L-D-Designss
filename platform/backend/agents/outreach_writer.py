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
You're writing cold outreach messages to local barber shops that don't have a proper website.

Your tone:
- Friendly and casual, like a local lad
- Never corporate or salesy
- Short and to the point
- Use natural UK phrasing (not American)
- Never use exclamation marks more than once
- Never say "I hope this message finds you well" or similar clichés
- Sound human, not like AI
- Focus on helping them get more bookings

Your offer:
- You build websites for barbers
- Prices start from £150 one-off, no monthly fees
- Quick turnaround (days not weeks)
- You handle everything — they just give you info
- You include: booking integration, services, gallery, contact, Google Maps

Always mention the preview website link if provided."""


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
            f"I build websites for local barbers — one-off price, no monthly fees, "
            f"and I handle everything start to finish.\n\n"
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


def generate_outreach(
    lead: dict,
    channel: str = "email",
    preview_url: str | None = None,
    sequence_day: int = 1,
) -> dict:
    """
    Main public function.
    Returns {'subject': ..., 'body': ...} for email
    or {'body': ...} for SMS.
    """
    if channel == "email":
        return _write_email(lead, preview_url, sequence_day)
    elif channel == "sms":
        body = _write_sms(lead, preview_url, sequence_day)
        return {"body": body}
    else:
        raise ValueError(f"Unknown channel: {channel}")


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
                "approved_by_founder": not settings.REQUIRE_APPROVAL,
            }).execute()

            db.table("leads").update({"status": "outreach_queued"}).eq("id", lead_id).execute()
            generated += 1

        except Exception as e:
            logger.error(f"Outreach batch failed for lead {lead.get('id')}: {e}")
            errors += 1

    logger.info(f"Outreach batch: {generated} generated, {skipped} skipped, {errors} errors")
    return {"generated": generated, "skipped": skipped, "errors": errors}
