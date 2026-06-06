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
