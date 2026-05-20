"""
Outreach Message Templates — L&D Designs
Natural, human-sounding messages for UK local businesses.

Usage:
    from templates import get_email, get_whatsapp, get_sms

All templates use {name} as a placeholder for the business name.
"""

# ── Email Templates ───────────────────────────────────────────────────────────

EMAIL_SUBJECTS = [
    "Quick question about {name}",
    "Noticed {name} doesn't have a website",
    "Website for {name}?",
    "{name} — happy to help",
    "Could get you more customers, {name}",
]

EMAIL_TEMPLATES = {

    "no_website_v1": {
        "subject": "Quick question about {name}",
        "body": """Hi,

I came across {name} and noticed you don't have a website yet.

I build clean, simple websites for local businesses — mainly barbers, plumbers, builders and that sort of trade. Nothing over the top, just something that looks professional and helps people find you on Google.

Prices start from £150 one-off and I can usually turn it around in a few days.

Worth a quick chat? I can send you a few examples if that helps.

Cheers,
Dylan
L&D Designs
"""
    },

    "no_website_v2": {
        "subject": "Website for {name}?",
        "body": """Hi there,

Just noticed {name} doesn't have a website — thought I'd reach out as I help local businesses in the area get set up online.

Most of my clients are tradespeople and local service businesses. I keep it simple and affordable — no monthly fees, no tech jargon.

Would you be open to a quick chat or for me to send over some examples?

Cheers,
Dylan
L&D Designs
"""
    },

    "facebook_only_v1": {
        "subject": "Noticed {name} on Facebook",
        "body": """Hi,

Found {name} on Facebook — looks like a solid business. Just wanted to mention that a lot of customers now look on Google before they check social media, so having an actual website can make a real difference.

I build websites for local businesses — simple, affordable and done properly.

Happy to show you what I've done for similar businesses nearby if you'd like.

Thanks,
Dylan
L&D Designs
"""
    },

    "facebook_only_v2": {
        "subject": "Could get you more customers, {name}",
        "body": """Hi,

I noticed {name} is only on Facebook at the moment. Nothing wrong with that, but most people search Google when they need a local service — and if you're not showing up, you're probably missing out.

I help local businesses get a proper website sorted — one that actually ranks on Google. Fast turnaround, honest prices.

Let me know if you'd like some more info.

Cheers,
Dylan
"""
    },

    "outdated_website_v1": {
        "subject": "Noticed {name}'s website could do with a refresh",
        "body": """Hi,

I came across {name}'s website — it looks like it might be a few years old.

An outdated site can actually put people off, especially on mobile. I help local businesses get a modern, clean website that actually works on phones and shows up properly on Google.

Might be worth a quick look — no obligation. Happy to send over some examples of what I've done for similar businesses.

Cheers,
Dylan
L&D Designs
"""
    },
}

# ── WhatsApp Templates ────────────────────────────────────────────────────────

WHATSAPP_TEMPLATES = {

    "no_website_v1": """Hi, I noticed {name} doesn't have a website yet. I build simple sites for local businesses — helps people find you on Google. Happy to send you a few examples if useful? — Dylan, L&D Designs""",

    "no_website_v2": """Hey, came across {name} and thought I'd reach out. I build websites for local trades and service businesses — straightforward, affordable, done properly. Worth a look? — Dylan""",

    "facebook_only_v1": """Hi there, found {name} on Facebook. Loads of customers search Google first though, so a website can really help. I keep it simple and affordable — happy to show you some examples if you're interested? Cheers, Dylan""",

    "outdated_website_v1": """Hi, I came across {name}'s website and thought it might be due a refresh. I update and rebuild sites for local businesses — fast turnaround, honest price. Worth a quick chat? — Dylan, L&D Designs""",
}

# ── SMS Templates ─────────────────────────────────────────────────────────────

SMS_TEMPLATES = {

    "no_website_v1": """Hi, I noticed {name} doesn't have a website. I build simple sites for local businesses from £150. Happy to chat if useful — Dylan, L&D Designs""",

    "no_website_v2": """Hi, came across {name}. I build websites for local businesses — quick turnaround and affordable. Worth a look? — Dylan, L&D Designs""",

    "facebook_only_v1": """Hi, {name} looks great on Facebook but most customers search Google. A website could really help. From £150 — Dylan, L&D Designs""",
}

# ── Follow-up Templates ───────────────────────────────────────────────────────

FOLLOWUP_EMAIL = {

    "followup_1": {
        "subject": "Re: {name} — just checking in",
        "body": """Hi,

Just following up on my message from a few days ago about a website for {name}.

Completely understand if it's not the right time — just wanted to make sure you saw it.

Happy to chat whenever suits you.

Cheers,
Dylan
"""
    },

    "followup_2": {
        "subject": "Last one from me — {name}",
        "body": """Hi,

Last message from me — I know inboxes get busy.

If you ever want to get a website sorted for {name}, just reply here or give me a ring. No pressure at all.

Cheers,
Dylan
L&D Designs
"""
    },
}

FOLLOWUP_WHATSAPP = {
    "followup_1": """Hey, just wanted to check you got my message about a website for {name}? No worries if not the right time — Dylan""",
    "followup_2": """Hi, last message from me! If you ever want to chat about a website for {name} just give me a shout. Cheers — Dylan""",
}

# ── Helper functions ──────────────────────────────────────────────────────────

def get_email(template_key, business_name, **kwargs):
    t = EMAIL_TEMPLATES.get(template_key)
    if not t:
        raise ValueError(f"Unknown email template: {template_key}")
    return {
        "subject": t["subject"].format(name=business_name, **kwargs),
        "body": t["body"].format(name=business_name, **kwargs),
    }

def get_whatsapp(template_key, business_name, **kwargs):
    t = WHATSAPP_TEMPLATES.get(template_key)
    if not t:
        raise ValueError(f"Unknown WhatsApp template: {template_key}")
    return t.format(name=business_name, **kwargs)

def get_sms(template_key, business_name, **kwargs):
    t = SMS_TEMPLATES.get(template_key)
    if not t:
        raise ValueError(f"Unknown SMS template: {template_key}")
    return t.format(name=business_name, **kwargs)

def get_followup_email(step, business_name, **kwargs):
    key = f"followup_{step}"
    t = FOLLOWUP_EMAIL.get(key)
    if not t:
        raise ValueError(f"Unknown follow-up step: {step}")
    return {
        "subject": t["subject"].format(name=business_name, **kwargs),
        "body": t["body"].format(name=business_name, **kwargs),
    }

def get_followup_whatsapp(step, business_name, **kwargs):
    key = f"followup_{step}"
    t = FOLLOWUP_WHATSAPP.get(key)
    if not t:
        raise ValueError(f"Unknown follow-up step: {step}")
    return t.format(name=business_name, **kwargs)

def choose_template(website_status):
    """Return the best template key based on website status."""
    if website_status in ("none",):
        return "no_website_v1"
    elif website_status == "social_only":
        return "facebook_only_v1"
    elif website_status in ("outdated", "error"):
        return "outdated_website_v1"
    return "no_website_v1"


if __name__ == "__main__":
    # Quick test
    print("=== Email ===")
    e = get_email("no_website_v1", "Smith's Barbershop")
    print(f"Subject: {e['subject']}")
    print(e['body'])

    print("=== WhatsApp ===")
    print(get_whatsapp("no_website_v1", "Dave's Plumbing"))

    print("=== SMS ===")
    print(get_sms("no_website_v1", "Mike's Garage"))

    print("=== Follow-up 1 (email) ===")
    f = get_followup_email(1, "Smith's Barbershop")
    print(f"Subject: {f['subject']}")
    print(f['body'])
