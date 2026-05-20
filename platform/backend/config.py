from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # Supabase
    SUPABASE_URL: str
    SUPABASE_ANON_KEY: str
    SUPABASE_SERVICE_KEY: str

    # OpenAI
    OPENAI_API_KEY: str

    # Gmail
    GMAIL_ADDRESS: str
    GMAIL_APP_PASSWORD: str

    # Twilio (optional)
    TWILIO_ACCOUNT_SID: Optional[str] = None
    TWILIO_AUTH_TOKEN: Optional[str] = None
    TWILIO_FROM_NUMBER: Optional[str] = None

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

    @property
    def is_production(self) -> bool:
        return self.APP_ENV == "production"

    @property
    def sms_enabled(self) -> bool:
        return bool(self.TWILIO_ACCOUNT_SID and self.TWILIO_AUTH_TOKEN and self.TWILIO_FROM_NUMBER)

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
