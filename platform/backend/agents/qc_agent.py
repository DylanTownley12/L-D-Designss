"""
Quality Control Agent
Validates outreach before anything is sent.
Blocks bad messages silently — prevents spam and embarrassing mistakes.
"""
import re
import logging
import requests
from config import settings

logger = logging.getLogger(__name__)

# Words/phrases that make messages sound spammy or AI-generated
SPAM_PHRASES = [
    "i hope this email finds you well",
    "i hope this message finds you",
    "as an ai",
    "please do not hesitate",
    "kind regards",
    "best regards",
    "dear sir or madam",
    "to whom it may concern",
    "synergize",
    "leverage",
    "paradigm",
    "proactive",
    "blockchain",
    "utilize",
    "actionable",
    "scalable",
]

REQUIRED_CONTACT = [settings.FOUNDER_PHONE, settings.FOUNDER_EMAIL]


def _check_email(subject: str, body: str, preview_url: str | None) -> list[str]:
    issues = []

    if not subject or len(subject.strip()) < 5:
        issues.append("Subject line missing or too short")

    if not body or len(body.strip()) < 20:
        issues.append("Email body too short")

    if len(body) > 1500:
        issues.append("Email body too long (over 1500 chars) — will look like spam")

    body_lower = body.lower()
    for phrase in SPAM_PHRASES:
        if phrase in body_lower:
            issues.append(f"Spammy phrase detected: '{phrase}'")

    # Must have some form of contact info or CTA
    has_contact = any(c in body for c in REQUIRED_CONTACT if c)
    has_cta = any(w in body_lower for w in ["reply", "whatsapp", "call", "book", "click", "visit"])
    if not has_contact and not has_cta:
        issues.append("No call-to-action or contact info found in email")

    # Check preview URL is valid if provided
    # Note: URL validation is best-effort; a reachability failure is logged but not blocking
    # to avoid batch failures when the preview server is cold or the URL is localhost in dev.
    if preview_url:
        url_issues = _validate_url(preview_url)
        if url_issues:
            logger.warning(f"Preview URL issues (non-blocking): {url_issues}")

    return issues


def _check_sms(body: str) -> list[str]:
    issues = []

    if not body or len(body.strip()) < 10:
        issues.append("SMS body too short")

    if len(body) > 320:
        issues.append("SMS over 320 chars — will split into multiple messages, costs more")

    body_lower = body.lower()
    for phrase in SPAM_PHRASES:
        if phrase in body_lower:
            issues.append(f"Spammy phrase: '{phrase}'")

    return issues


def _validate_url(url: str) -> list[str]:
    issues = []
    try:
        r = requests.head(url, timeout=8, allow_redirects=True)
        if r.status_code >= 400:
            issues.append(f"Preview URL returns HTTP {r.status_code}")
    except requests.exceptions.ConnectionError:
        issues.append("Preview URL is not reachable")
    except requests.exceptions.Timeout:
        issues.append("Preview URL timed out")
    except Exception as e:
        issues.append(f"Preview URL check failed: {str(e)[:50]}")
    return issues


def validate(
    channel: str,
    subject: str | None,
    body: str,
    preview_url: str | None = None,
    lead: dict | None = None,
) -> dict:
    """
    Validate an outreach message before sending.
    Returns {'passed': bool, 'issues': list[str]}.
    """
    issues = []

    if not body or not body.strip():
        return {"passed": False, "issues": ["Empty message body"]}

    if channel == "email":
        issues.extend(_check_email(subject or "", body, preview_url))
    elif channel == "sms":
        issues.extend(_check_sms(body))

    # Check lead has contact info for this channel
    if lead:
        if channel == "email" and not lead.get("email"):
            issues.append("Lead has no email address — cannot send email")
        if channel == "sms" and not lead.get("phone"):
            issues.append("Lead has no phone number — cannot send SMS")
        if lead.get("status") == "do_not_contact":
            issues.append("Lead is marked Do Not Contact")
        if lead.get("status") in ("converted", "not_interested") and channel == "sms":
            issues.append("Lead is already converted or marked not interested")

    passed = len(issues) == 0
    return {"passed": passed, "issues": issues}
