"""
On-demand trade preview sites + deterministic QA gate (Phase 5).

The sales motion: the founder taps "build preview" on a worth-it prospect → we
generate a real, mobile-first one-page site for them with a LIVE lead-capture form
(posting to /api/capture/<prospect capture_token>) → a deterministic QA check gates
it. FAIL → qa_failed + listed reasons + red alert, blocked from READY. PASS → a
human taps APPROVE to flip DRAFT→READY (the only thing that unlocks the WhatsApp /
copy buttons). NO AI 0-10 scoring — every check is a hard, explainable rule.

Nothing here contacts anyone. The preview is shown by the founder, on the call.
"""
import logging
import re
import secrets
import time
from datetime import datetime, timezone

import httpx

from config import settings
from db.client import get_db
from agents import trades

logger = logging.getLogger(__name__)

PLACEHOLDER_RE = re.compile(r"lorem ipsum|your business name|placeholder|tbd|coming soon|xxxx", re.I)


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


# ── HTML generation ───────────────────────────────────────────────────
def _site_html(prospect: dict, capture_token: str) -> str:
    """A real, mobile-first one-pager for a trade. Viewport + tel: + live capture
    form (correct token) + business name + concrete copy (no placeholders)."""
    biz = (prospect.get("business_name") or "Your Trade").strip()
    trade = (prospect.get("trade") or "tradesperson").strip()
    town = (prospect.get("town") or "your area").strip()
    phone = (prospect.get("phone") or "").strip()
    api = settings.BACKEND_BASE_URL.rstrip("/")
    tel_digits = re.sub(r"\s+", "", phone)
    services = {
        "plumber": ["Emergency leaks & burst pipes", "Bathrooms & taps", "Blocked drains"],
        "heating engineer": ["Boiler repair & servicing", "New boiler installs", "Radiators & heating"],
        "gas engineer": ["Gas safety checks", "Boiler & cooker installs", "Leak detection"],
        "electrician": ["Fault finding & repairs", "Fuse boards & rewires", "Lights & sockets"],
        "drainage": ["Blocked drains cleared", "CCTV drain surveys", "Drain repairs"],
        "roofer": ["Roof repairs & leaks", "New roofs & flat roofs", "Gutters & fascias"],
    }.get(trade.lower(), ["Fast, reliable local service", "Free no-obligation quotes", "Fully insured work"])
    svc_html = "".join(f'<li>{s}</li>' for s in services)
    tel_block = (f'<a class="cta" href="tel:{tel_digits}">📞 Call {phone}</a>' if tel_digits
                 else '<span class="cta cta-off">Add your number</span>')

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{biz} — {trade.title()} in {town}</title>
<style>
*{{margin:0;padding:0;box-sizing:border-box}}
body{{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#15171c;background:#f6f4ef;line-height:1.55}}
.wrap{{max-width:760px;margin:0 auto;padding:0 18px}}
header{{background:#1c3d5e;color:#fff;padding:46px 0 40px;text-align:center}}
header h1{{font-size:30px;letter-spacing:.3px}}
header p{{opacity:.9;margin-top:8px}}
.cta{{display:inline-block;margin-top:18px;background:#ffb547;color:#15171c;font-weight:800;
  padding:14px 26px;border-radius:100px;text-decoration:none;font-size:17px}}
.cta-off{{background:#cbb48a}}
section{{padding:34px 0;border-bottom:1px solid rgba(21,23,28,.1)}}
h2{{font-size:21px;margin-bottom:14px}}
ul{{list-style:none}} ul li{{padding:9px 0;padding-left:26px;position:relative}}
ul li:before{{content:"✓";position:absolute;left:0;color:#1c3d5e;font-weight:800}}
.review{{background:#fff;border:1px solid rgba(21,23,28,.1);border-radius:12px;padding:16px;margin-top:12px}}
form{{background:#fff;border:1px solid rgba(21,23,28,.12);border-radius:14px;padding:20px;margin-top:8px}}
label{{display:block;font-size:13px;font-weight:700;color:#5b5f66;margin:12px 0 5px}}
input,textarea{{width:100%;padding:13px;border:1px solid rgba(21,23,28,.15);border-radius:9px;font-size:16px;background:#f6f4ef}}
button{{width:100%;margin-top:18px;background:#1c3d5e;color:#fff;border:0;border-radius:9px;padding:15px;font-size:16px;font-weight:700;cursor:pointer}}
.ok{{display:none;background:#e9f7ef;border:1px solid #1c8a4b;color:#15532e;padding:14px;border-radius:9px;margin-top:14px}}
footer{{text-align:center;color:#5b5f66;font-size:13px;padding:26px 0}}
</style>
</head>
<body>
<header><div class="wrap">
  <h1>{biz}</h1>
  <p>{trade.title()} · {town} · trusted local service</p>
  {tel_block}
</div></header>

<div class="wrap">
  <section>
    <h2>What we do</h2>
    <ul>{svc_html}</ul>
  </section>

  <section>
    <h2>What customers say</h2>
    <div class="review">“Turned up on time, sorted it fast, fair price. Would recommend to anyone in {town}.” — local customer</div>
    <div class="review">“Honest, tidy and reliable — exactly what you want from a {trade}.” — local customer</div>
  </section>

  <section>
    <h2>Request a callback</h2>
    <p>Leave your details and {biz} will call you straight back — usually within the hour.</p>
    <form id="capture" data-token="{capture_token}">
      <label>Your name</label><input name="name" placeholder="e.g. Sarah Jones">
      <label>Phone number *</label><input name="phone" inputmode="tel" placeholder="07…" required>
      <label>Postcode</label><input name="postcode" placeholder="e.g. {town[:2].upper()}1 1AA">
      <label>What's the job?</label><textarea name="job_description" rows="3" placeholder="Briefly describe the job…"></textarea>
      <button type="submit">Request a callback</button>
      <div class="ok" id="ok">Thanks — {biz} has your details and will be in touch shortly.</div>
    </form>
  </section>
</div>

<footer>© {biz} · {town} · Powered by L&amp;D Designs</footer>

<script>
(function(){{
  var f=document.getElementById('capture');
  f.addEventListener('submit',function(e){{
    e.preventDefault();
    var t=f.getAttribute('data-token');
    var body={{name:f.name.value,phone:f.phone.value,postcode:f.postcode.value,job_description:f.job_description.value}};
    fetch('{api}/api/capture/'+t,{{method:'POST',headers:{{'Content-Type':'application/json'}},body:JSON.stringify(body)}})
      .then(function(r){{return r.json()}})
      .then(function(){{document.getElementById('ok').style.display='block';f.reset();}})
      .catch(function(){{document.getElementById('ok').style.display='block';}});
  }});
}})();
</script>
</body>
</html>"""


# ── Build + QA ────────────────────────────────────────────────────────
def build_for_prospect(name_or_id: str) -> dict:
    """Mint a capture token, generate the site, store it as a DRAFT preview, then QA it."""
    db = get_db()
    p = trades.find_prospect(name_or_id)
    if not p:
        return {"ok": False, "message": f"No prospect found for '{name_or_id}'."}

    token = p.get("capture_token") or secrets.token_urlsafe(12)
    if not p.get("capture_token"):
        db.table("prospects").update({"capture_token": token}).eq("id", p["id"]).execute()

    html = _site_html({**p, "capture_token": token}, token)
    preview_url = f"{settings.BACKEND_BASE_URL.rstrip('/')}/previews/serve/"  # + id after insert
    rec = {"html_content": html, "prospect_id": p["id"], "qa_status": "pending"}
    try:
        res = db.table("previews").insert(rec).execute()
        pid = res.data[0]["id"] if res.data else None
    except Exception as e:
        return {"ok": False, "message": f"Couldn't store preview (is the previews table present?): {e}"}
    if pid:
        db.table("previews").update({"preview_url": preview_url + pid}).eq("id", pid).execute()
        db.table("prospects").update({"preview_id": pid, "preview_status": "draft",
                                      "updated_at": _now_iso()}).eq("id", p["id"]).execute()
    trades.log_event("preview_qa", f"built preview for {p.get('business_name')}", "info",
                     {"prospect_id": p["id"], "preview_id": pid})
    return qa_preview(pid)


def qa_html(html: str, business_name: str, capture_token: str) -> tuple:
    """Deterministic content checks on the generated HTML. Returns (passed, reasons)."""
    reasons = []
    h = html or ""
    if "<meta name=\"viewport\"" not in h and "name='viewport'" not in h:
        reasons.append("no <meta viewport> (not mobile-ready)")
    if "tel:" not in h:
        reasons.append("no tel: call link")
    if "<form" not in h or capture_token not in h:
        reasons.append("capture form with the correct token missing")
    if business_name and business_name.lower() not in h.lower():
        reasons.append("business name not shown")
    if PLACEHOLDER_RE.search(h):
        reasons.append("placeholder/lorem text present")
    if len(h) < 800:
        reasons.append("page too thin / likely broken")
    return (len(reasons) == 0, reasons)


def qa_preview(preview_id: str) -> dict:
    """Run the full QA gate on a stored preview: content checks + HTTP 200 + <3s load.
    Sets qa_status (qa_failed|qa_passed) + reasons; raises/clears an alert; never
    auto-promotes to READY (that's a human APPROVE)."""
    db = get_db()
    if not preview_id:
        return {"ok": False, "message": "No preview id."}
    try:
        pv = db.table("previews").select("*").eq("id", preview_id).single().execute().data
    except Exception as e:
        return {"ok": False, "message": f"Preview not found: {e}"}
    prospect = None
    if pv.get("prospect_id"):
        try:
            prospect = db.table("prospects").select("*").eq("id", pv["prospect_id"]).single().execute().data
        except Exception:
            prospect = None
    biz = (prospect or {}).get("business_name") or ""
    token = (prospect or {}).get("capture_token") or ""

    passed, reasons = qa_html(pv.get("html_content") or "", biz, token)

    # Live fetch: HTTP 200 + under 3s.
    url = pv.get("preview_url") or f"{settings.BACKEND_BASE_URL.rstrip('/')}/previews/serve/{preview_id}"
    try:
        t0 = time.time()
        with httpx.Client(timeout=8.0, follow_redirects=True) as client:
            r = client.get(url)
        elapsed = time.time() - t0
        if r.status_code != 200:
            passed = False; reasons.append(f"URL returned HTTP {r.status_code}")
        elif elapsed > 3.0:
            passed = False; reasons.append(f"loads slowly ({elapsed:.1f}s > 3s)")
    except Exception as e:
        passed = False; reasons.append(f"URL unreachable: {str(e)[:60]}")

    status = "qa_passed" if passed else "qa_failed"
    db.table("previews").update({"qa_status": status, "qa_reasons": reasons,
                                 "qa_checked_at": _now_iso()}).eq("id", preview_id).execute()
    if pv.get("prospect_id"):
        db.table("prospects").update({"preview_status": ("draft" if passed else "qa_failed")}
                                     ).eq("id", pv["prospect_id"]).execute()
        if passed:
            trades.resolve_alert(kind="qa_failed", entity_id=pv["prospect_id"])
        else:
            trades.raise_alert("qa_failed", f"Preview QA failed for {biz or preview_id}: "
                               + "; ".join(reasons), "error", entity="preview",
                               entity_id=pv["prospect_id"],
                               mode=(prospect or {}).get("data_mode") or "real")
    trades.log_event("preview_qa", f"QA {status} for {biz or preview_id}"
                     + (f" — {'; '.join(reasons)}" if reasons else ""),
                     "success" if passed else "error",
                     {"preview_id": preview_id, "metric_ok": passed, "reasons": reasons})
    return {"ok": True, "passed": passed, "qa_status": status, "reasons": reasons,
            "preview_id": preview_id, "preview_url": url, "business_name": biz,
            "message": (f"QA PASSED for {biz} — ready to approve." if passed
                        else f"QA FAILED for {biz}: " + "; ".join(reasons))}


def approve_preview(name_or_id: str = None, preview_id: str = None) -> dict:
    """Human APPROVE: flip a qa_passed preview to READY (unlocks share buttons).
    Refuses to promote a qa_failed preview."""
    db = get_db()
    prospect = trades.find_prospect(name_or_id) if name_or_id else None
    if prospect and not preview_id:
        preview_id = prospect.get("preview_id")
    if not preview_id:
        return {"ok": False, "message": "No preview to approve — build one first."}
    try:
        pv = db.table("previews").select("*").eq("id", preview_id).single().execute().data
    except Exception as e:
        return {"ok": False, "message": f"Preview not found: {e}"}
    if pv.get("qa_status") != "qa_passed":
        return {"ok": False, "message": f"Can't approve — QA status is {pv.get('qa_status')}. "
                "Fix the issues and re-run QA first."}
    db.table("previews").update({"qa_status": "ready"}).eq("id", preview_id).execute()
    if pv.get("prospect_id"):
        db.table("prospects").update({"preview_status": "ready", "updated_at": _now_iso()}
                                     ).eq("id", pv["prospect_id"]).execute()
    biz = (prospect or {}).get("business_name") or preview_id
    trades.log_event("preview_qa", f"preview APPROVED → READY for {biz}", "success",
                     {"preview_id": preview_id})
    return {"ok": True, "message": f"Preview for {biz} is READY — share it on the call."}


def run_all(mode: str = "real") -> dict:
    """Re-QA every prospect preview in this data_mode (the RUN NOW sweep)."""
    db = get_db()
    try:
        pros = (db.table("prospects").select("id,preview_id,data_mode")
                .eq("data_mode", mode).limit(2000).execute().data or [])
    except Exception:
        pros = []
    checked = failed = 0
    for p in pros:
        if not p.get("preview_id"):
            continue
        r = qa_preview(p["preview_id"])
        checked += 1
        if not r.get("passed"):
            failed += 1
    msg = (f"Re-QA'd {checked} preview(s) — {failed} failing." if checked
           else "No previews to QA yet. Build one with 'build preview <name>'.")
    trades.log_event("preview_qa", msg, "success" if failed == 0 else "warn",
                     {"checked": checked, "failed": failed, "metric_ok": failed == 0})
    return {"ok": True, "checked": checked, "failed": failed, "message": msg}
