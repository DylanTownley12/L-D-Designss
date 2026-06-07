from pydantic import BaseModel, EmailStr
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


class WebsiteStatus(str, Enum):
    none = "none"
    weak = "weak"
    decent = "decent"
    good = "good"
    unknown = "unknown"


class LeadStatus(str, Enum):
    new = "new"
    analyzing = "analyzing"
    preview_ready = "preview_ready"
    outreach_queued = "outreach_queued"
    outreach_sent = "outreach_sent"
    replied = "replied"
    interested = "interested"
    called = "called"                     # Dylan called them
    follow_up_required = "follow_up_required"  # needs a follow-up call
    payment_link_sent = "payment_link_sent"    # Stripe link sent
    converted = "converted"              # paid / customer
    not_interested = "not_interested"
    do_not_contact = "do_not_contact"


class MessageStatus(str, Enum):
    draft = "draft"
    queued = "queued"
    approved = "approved"
    sent = "sent"
    delivered = "delivered"
    failed = "failed"
    replied = "replied"


# ── Leads ──────────────────────────────────────────────────────────────

class LeadCreate(BaseModel):
    business_name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    postcode: Optional[str] = None
    website: Optional[str] = None
    instagram_url: Optional[str] = None
    facebook_url: Optional[str] = None
    google_rating: Optional[float] = None
    google_reviews: Optional[int] = 0
    source: Optional[str] = "manual"
    notes: Optional[str] = None


class LeadUpdate(BaseModel):
    status: Optional[LeadStatus] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    notes: Optional[str] = None
    quality_score: Optional[int] = None


class Lead(LeadCreate):
    id: str
    status: LeadStatus = LeadStatus.new
    website_status: WebsiteStatus = WebsiteStatus.unknown
    quality_score: int = 0
    analysis_data: Dict[str, Any] = {}
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ── Outreach Messages ──────────────────────────────────────────────────

class MessageCreate(BaseModel):
    lead_id: str
    channel: str  # email, sms
    subject: Optional[str] = None
    body: str
    scheduled_at: Optional[datetime] = None
    sequence_day: Optional[int] = None


class MessageApprove(BaseModel):
    message_id: str
    approved: bool
    edited_body: Optional[str] = None


class OutreachMessage(BaseModel):
    id: str
    lead_id: str
    channel: str
    direction: str
    subject: Optional[str]
    body: str
    status: MessageStatus
    sent_at: Optional[datetime]
    sequence_day: Optional[int]
    ai_generated: bool
    approved_by_founder: bool
    created_at: datetime


# ── Preview ────────────────────────────────────────────────────────────

class PreviewData(BaseModel):
    lead_id: str
    business_name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    postcode: Optional[str] = None
    website: Optional[str] = None
    google_rating: Optional[float] = None
    google_reviews: Optional[int] = None
    instagram_url: Optional[str] = None


# ── Dashboard ──────────────────────────────────────────────────────────

class DashboardStats(BaseModel):
    total_leads: int
    new_leads: int
    outreach_sent: int
    replies: int
    interested: int
    converted: int
    previews_generated: int
    outreach_queued: int
    emails_today: int
    revenue_total: float


# ── Agent trigger ──────────────────────────────────────────────────────

class AgentRunRequest(BaseModel):
    agent: str
    lead_id: Optional[str] = None
    params: Optional[Dict[str, Any]] = {}


class AgentRunResult(BaseModel):
    agent: str
    status: str
    message: str
    data: Optional[Dict[str, Any]] = None


# ── Notification ───────────────────────────────────────────────────────

class Notification(BaseModel):
    id: str
    lead_id: Optional[str]
    type: str
    title: str
    body: Optional[str]
    read: bool
    action_url: Optional[str]
    created_at: datetime
