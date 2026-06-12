from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # Supabase
    SUPABASE_URL: str
    SUPABASE_ANON_KEY: str
    SUPABASE_SERVICE_KEY: str

    # OpenAI
    OPENAI_API_KEY: str

    # Anthropic (agent chat + Claude tasks)
    ANTHROPIC_API_KEY: Optional[str] = None
    # Model used by JARVIS + the trades sales agents. Swap to "claude-fable-5"
    # (or any new model id) here or via the Railway env var — no code change.
    CLAUDE_MODEL: str = "claude-opus-4-8"

    # JARVIS — Telegram operator bot (founders only)
    TELEGRAM_BOT_TOKEN: Optional[str] = None
    FOUNDER_CHAT_IDS: str = ""            # comma-separated Telegram chat IDs allowed to talk to JARVIS
    FOUNDER_D_CHAT_ID: Optional[str] = None   # Dylan's chat id (gets D's call list at 08:00)
    FOUNDER_L_CHAT_ID: Optional[str] = None   # L's chat id (gets L's call list at 08:00)

    # Founder notifications — PRIMARY channel. POSTs internal alerts/briefings to
    # OpenClaw (Baz) which relays them to the founders' WhatsApp. Telegram is a
    # fallback only. Set this in Railway to the OpenClaw inbound webhook URL.
    # NOTHING here ever contacts a prospect or client — founders only.
    OPENCLAW_WEBHOOK_URL: Optional[str] = None

    # Internal ops board gate (founders only). Falls back to SECRET_KEY if unset.
    OPS_KEY: Optional[str] = None

    # Where the public capture form + client dashboard live (for building links)
    FRONTEND_BASE_URL: str = "https://l-d-designss.vercel.app"
    # This backend's own public URL (for generated previews' live capture form + webhooks)
    BACKEND_BASE_URL: str = "https://l-d-designss-production.up.railway.app"

    # Gmail
    GMAIL_ADDRESS: str
    GMAIL_APP_PASSWORD: str

    # Google Places API (optional — enables lead finder)
    GOOGLE_PLACES_API_KEY: Optional[str] = None

    # Twilio (optional — legacy, replaced by TextMagic)
    TWILIO_ACCOUNT_SID: Optional[str] = None
    TWILIO_AUTH_TOKEN: Optional[str] = None
    TWILIO_FROM_NUMBER: Optional[str] = None

    # TextMagic (preferred SMS provider — no UK regulatory approval needed)
    TEXTMAGIC_USERNAME: Optional[str] = None
    TEXTMAGIC_API_KEY: Optional[str] = None

    # Stripe payments
    STRIPE_SECRET_KEY: Optional[str] = None
    STRIPE_WEBHOOK_SECRET: Optional[str] = None
    STRIPE_PRICE_ID: Optional[str] = None  # £75 deposit price ID
    STRIPE_SUCCESS_URL: str = "https://dylantownley12.github.io/L-D-Designss/book.html?success=1"
    STRIPE_CANCEL_URL: str = "https://dylantownley12.github.io/L-D-Designss/book.html"

    # Business
    FOUNDER_PHONE: str = "07301181878"
    FOUNDER_EMAIL: str = ""
    BUSINESS_NAME: str = "L&D Designs"
    BUSINESS_WEBSITE: str = "https://dylantownley12.github.io/L-D-Designss"

    # App
    APP_ENV: str = "development"
    SECRET_KEY: str = "change-me"
    PREVIEW_BASE_URL: str = "http://localhost:8000/previews"

    # Trades pipeline — how many no-website prospects the self-running pipeline
    # keeps on the books (top-up + v3 previews + D/L balance).
    PROSPECT_TARGET: int = 220

    # Limits
    MAX_EMAILS_PER_DAY: int = 50
    MAX_SMS_PER_DAY: int = 20
    REQUIRE_APPROVAL: bool = True

    # Safety guardrails (see safety.py — all overridable via Railway vars)
    SAFETY_ENABLED: bool = True              # master switch; set False to disable all guards
    DAILY_SPEND_CAP_GBP: float = 2.00        # autonomous jobs halt for the day past this est. spend
    SAFETY_KILL_SWITCH_DAYS: int = 30        # no revenue for this many days → kill-switch
    SAFETY_KILL_SWITCH_MODE: str = "alert"   # "alert" (warn only) or "pause" (block autonomous sends)
    MAX_WHATSAPP_PER_DAY: int = 10           # ban protection — keep low after the volume ban
    MAX_INSTAGRAM_PER_DAY: int = 20

    @property
    def is_production(self) -> bool:
        return self.APP_ENV == "production"

    @property
    def preview_base_url_resolved(self) -> str:
        """Return the correct preview base URL. Guards against the Railway env var still pointing to localhost."""
        if "localhost" in self.PREVIEW_BASE_URL and self.is_production:
            return "https://l-d-designss-production.up.railway.app/previews"
        return self.PREVIEW_BASE_URL

    @property
    def sms_enabled(self) -> bool:
        # TextMagic takes priority; fall back to Twilio
        if self.TEXTMAGIC_USERNAME and self.TEXTMAGIC_API_KEY:
            return True
        return bool(self.TWILIO_ACCOUNT_SID and self.TWILIO_AUTH_TOKEN and self.TWILIO_FROM_NUMBER)

    # ── JARVIS / founders helpers ──────────────────────────────────────
    @property
    def founder_chat_id_list(self) -> list:
        """All Telegram chat IDs permitted to use JARVIS (founders only)."""
        ids = [c.strip() for c in (self.FOUNDER_CHAT_IDS or "").split(",") if c.strip()]
        for extra in (self.FOUNDER_D_CHAT_ID, self.FOUNDER_L_CHAT_ID):
            if extra and extra.strip() and extra.strip() not in ids:
                ids.append(extra.strip())
        return ids

    def is_founder(self, chat_id) -> bool:
        return str(chat_id) in self.founder_chat_id_list

    def founder_code_for_chat(self, chat_id) -> str:
        """Map a Telegram chat id to a founder code (D or L). Defaults to D."""
        if self.FOUNDER_L_CHAT_ID and str(chat_id) == str(self.FOUNDER_L_CHAT_ID).strip():
            return "L"
        return "D"

    @property
    def ops_key_resolved(self) -> str:
        return (self.OPS_KEY or self.SECRET_KEY or "").strip()

    @property
    def telegram_enabled(self) -> bool:
        return bool(self.TELEGRAM_BOT_TOKEN and self.founder_chat_id_list)

    @property
    def notify_enabled(self) -> bool:
        """True if ANY founder-notification channel is configured (OpenClaw or Telegram)."""
        return bool((self.OPENCLAW_WEBHOOK_URL or "").strip()) or self.telegram_enabled

    @property
    def notify_channel(self) -> str:
        if (self.OPENCLAW_WEBHOOK_URL or "").strip():
            return "openclaw"
        if self.telegram_enabled:
            return "telegram"
        return "none"

    @property
    def sms_provider(self) -> str:
        if self.TEXTMAGIC_USERNAME and self.TEXTMAGIC_API_KEY:
            return "textmagic"
        if self.TWILIO_ACCOUNT_SID and self.TWILIO_AUTH_TOKEN and self.TWILIO_FROM_NUMBER:
            return "twilio"
        return "none"

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
