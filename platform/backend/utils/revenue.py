"""
Pure revenue-priority logic — no FastAPI dependency, safe to import in tests.
"""

AGENT_SCHEDULE = {
    "lead_finder":        {"interval_h": 24,  "window_h": 26,  "label": "Daily 06:00"},
    "website_analyzer":   {"interval_h": 2,   "window_h": 3,   "label": "Every 2h"},
    "preview_generator":  {"interval_h": 24,  "window_h": 26,  "label": "Daily 06:30"},
    "outreach_writer":    {"interval_h": 24,  "window_h": 26,  "label": "Daily 07:00"},
    "followup_agent":     {"interval_h": 24,  "window_h": 26,  "label": "Daily 09:00"},
    "lead_enricher":      {"interval_h": 24,  "window_h": 26,  "label": "Daily 06:05"},
    "outreach_sender":    {"interval_h": 0.5, "window_h": 1,   "label": "Every 30m"},
    "ceo_agent":          {"interval_h": 1,   "window_h": 2,   "label": "Every 1h"},
    "preview_refresher":  {"interval_h": 24,  "window_h": 26,  "label": "Daily 11:30"},
    "notification_agent": {"interval_h": 24,  "window_h": 26,  "label": "On-demand"},
    "orchestrator":       {"interval_h": 24,  "window_h": 26,  "label": "On-demand"},
    "self_heal":          {"interval_h": 0.5, "window_h": 1,   "label": "Every 30m"},
}


def revenue_score(lead_status: str, hours_since_contact: float, has_phone: bool, has_instagram: bool) -> int:
    """
    Revenue urgency score 0-85. Higher = more likely to convert if acted on now.
    Used to sort the action queue so the most valuable leads surface first.
    """
    score = {"interested": 50, "replied": 40, "outreach_queued": 20, "preview_ready": 10, "new": 5}.get(lead_status, 0)
    if hours_since_contact < 2:
        score += 20
    elif hours_since_contact < 24:
        score += 10
    if has_phone:
        score += 10
    if has_instagram:
        score += 5
    return score
