"""
Lead Finder Agent
Uses Google Places API (New) to find barber shops with no website across UK cities.
"""
import time
import logging
import httpx
from datetime import datetime
from db.client import get_db
from config import settings
from utils.helpers import log_agent_action, clean_phone

logger = logging.getLogger(__name__)

PLACES_URL = "https://places.googleapis.com/v1/places:searchText"
FIELD_MASK = (
    "places.id,places.displayName,places.formattedAddress,"
    "places.nationalPhoneNumber,places.websiteUri,"
    "places.rating,places.userRatingCount"
)

SOCIAL_DOMAINS = (
    "facebook.com", "instagram.com", "twitter.com",
    "tiktok.com", "linkedin.com", "linktree.com", "linktr.ee",
)

UK_CITIES = [
    # North West
    "Wigan", "Manchester", "Liverpool", "Preston", "Bolton", "Blackburn",
    "Burnley", "Oldham", "Stockport", "Rochdale", "Salford", "Warrington",
    "St Helens", "Bury", "Blackpool", "Lancaster", "Carlisle",
    # Yorkshire
    "Leeds", "Sheffield", "Bradford", "Wakefield", "Huddersfield", "Halifax",
    "York", "Hull", "Doncaster", "Rotherham", "Barnsley", "Scarborough",
    # West Midlands
    "Birmingham", "Coventry", "Wolverhampton", "Stoke-on-Trent", "Derby",
    "Walsall", "West Bromwich", "Dudley", "Solihull", "Worcester",
    # East Midlands
    "Nottingham", "Leicester", "Northampton", "Lincoln", "Peterborough",
    # East of England
    "Norwich", "Ipswich", "Cambridge", "Colchester", "Chelmsford",
    # London & South East
    "London", "Croydon", "Brighton", "Southampton", "Portsmouth",
    "Oxford", "Reading", "Milton Keynes", "Guildford", "Slough", "Watford",
    # South West
    "Bristol", "Plymouth", "Exeter", "Swindon", "Bath",
    "Bournemouth", "Poole", "Gloucester", "Cheltenham",
    # North East
    "Newcastle", "Sunderland", "Middlesbrough", "Gateshead", "Durham", "Darlington",
    # Scotland
    "Glasgow", "Edinburgh", "Aberdeen", "Dundee", "Inverness", "Stirling",
    # Wales
    "Cardiff", "Swansea", "Newport", "Wrexham",
    # Northern Ireland
    "Belfast", "Derry",
    # North West (smaller towns)
    "Leigh", "Atherton", "Hindley", "Westhoughton", "Horwich", "Chorley",
    "Leyland", "Skelmersdale", "Ormskirk", "Southport", "Formby",
    "Widnes", "Runcorn", "Crewe", "Macclesfield", "Wilmslow",
    "Altrincham", "Sale", "Stretford", "Eccles", "Irlam",
    # Yorkshire (smaller towns)
    "Keighley", "Dewsbury", "Batley", "Castleford", "Pontefract",
    "Harrogate", "Selby", "Goole", "Grimsby", "Scunthorpe",
    "Cleethorpes", "Beverley", "Bridlington",
    # West Midlands (smaller towns)
    "Cannock", "Tamworth", "Lichfield", "Stafford", "Burton upon Trent",
    "Hereford", "Kidderminster", "Redditch", "Bromsgrove", "Nuneaton",
    "Rugby", "Leamington Spa", "Stratford-upon-Avon",
    # East Midlands (smaller towns)
    "Mansfield", "Newark", "Loughborough", "Hinckley", "Corby",
    "Kettering", "Wellingborough", "Bedford", "Luton",
    # South East (smaller towns)
    "Maidstone", "Canterbury", "Folkestone", "Margate", "Thanet",
    "Hastings", "Eastbourne", "Worthing", "Crawley", "Horsham",
    "Basingstoke", "Winchester", "Salisbury", "Andover",
    "Aldershot", "Farnham", "Woking", "Staines",
    # East of England
    "Stevenage", "Hertford", "St Albans", "Watford", "Hemel Hempstead",
    "Lowestoft", "Great Yarmouth", "Kings Lynn",
    # South West (smaller towns)
    "Taunton", "Yeovil", "Weston-super-Mare", "Torquay", "Paignton",
    "Barnstaple", "Truro", "Falmouth", "Penzance",
    # North East (smaller towns)
    "Hartlepool", "Stockton-on-Tees", "Bishop Auckland", "Consett",
    "Hexham", "Alnwick",
    # Scotland (smaller towns)
    "Paisley", "Motherwell", "Hamilton", "Ayr", "Kilmarnock",
    "Dumfries", "Perth", "Kirkcaldy", "Falkirk",
]


def _has_real_website(url: str) -> bool:
    if not url:
        return False
    return not any(d in url.lower() for d in SOCIAL_DOMAINS)


def _search_city(city: str, page_token: str = None) -> tuple[list[dict], str | None]:
    """Call Google Places API for one page of barbers in a city."""
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": settings.GOOGLE_PLACES_API_KEY,
        "X-Goog-FieldMask": FIELD_MASK,
    }
    body = {
        "textQuery": f"barbers in {city}, UK",
        "languageCode": "en-GB",
        "regionCode": "GB",
        "pageSize": 20,
    }
    if page_token:
        body["pageToken"] = page_token

    try:
        with httpx.Client(timeout=20.0) as client:
            r = client.post(PLACES_URL, headers=headers, json=body)
            if r.status_code != 200:
                logger.warning(f"Places API returned {r.status_code} for {city}: {r.text[:200]}")
                return [], None
            data = r.json()
            places = data.get("places", [])
            next_token = data.get("nextPageToken")
            return places, next_token
    except Exception as e:
        logger.error(f"Places API request failed for {city}: {e}")
        return [], None


def _parse_place(place: dict, city: str) -> dict | None:
    """Convert a Google Places result into a lead dict."""
    name = place.get("displayName", {}).get("text", "").strip()
    if not name:
        return None

    website = place.get("websiteUri", "")
    if _has_real_website(website):
        return None  # Already has a website — skip

    phone_raw = place.get("nationalPhoneNumber", "")
    phone = clean_phone(phone_raw) if phone_raw else None

    address = place.get("formattedAddress", "")

    rating = place.get("rating")
    reviews = place.get("userRatingCount", 0)

    return {
        "business_name": name,
        "phone": phone,
        "address": address,
        "city": city,
        "website": website or None,
        "website_status": "none",
        "google_rating": float(rating) if rating else None,
        "google_reviews": int(reviews) if reviews else 0,
        "source": "google_maps",
    }


def run(cities: list[str] | None = None, pages_per_city: int = 3) -> dict:
    """
    Main entry point for the Lead Finder agent.
    Uses Google Places API to find barbers with no website across UK cities.
    """
    if not settings.GOOGLE_PLACES_API_KEY:
        logger.error("GOOGLE_PLACES_API_KEY not set — cannot run lead finder")
        return {"error": "GOOGLE_PLACES_API_KEY not configured"}

    start = datetime.now()
    db = get_db()
    cities_to_search = cities or UK_CITIES
    new_leads = 0
    skipped_dupes = 0
    skipped_has_website = 0
    errors = 0

    for city in cities_to_search:
        logger.info(f"Searching {city}...")
        page_token = None

        for page_num in range(1, pages_per_city + 1):
            if page_num > 1 and not page_token:
                break  # No more pages

            places, page_token = _search_city(city, page_token if page_num > 1 else None)

            if not places:
                break

            for place in places:
                lead = _parse_place(place, city)
                if lead is None:
                    skipped_has_website += 1
                    continue

                try:
                    existing = (
                        db.table("leads")
                        .select("id")
                        .eq("business_name", lead["business_name"])
                        .eq("city", city)
                        .execute()
                    )
                    if existing.data:
                        skipped_dupes += 1
                        continue

                    db.table("leads").insert(lead).execute()
                    new_leads += 1

                except Exception as e:
                    logger.error(f"DB insert failed for {lead.get('business_name')}: {e}")
                    errors += 1

            if page_token:
                time.sleep(2)  # Google requires a short delay before using nextPageToken

        time.sleep(1)  # Polite pause between cities

    duration_ms = int((datetime.now() - start).total_seconds() * 1000)

    log_agent_action(db, "lead_finder", "google_places_search", None, "success", {
        "cities": len(cities_to_search),
        "new_leads": new_leads,
        "skipped_dupes": skipped_dupes,
        "skipped_has_website": skipped_has_website,
        "errors": errors,
    }, duration_ms)

    return {
        "cities_searched": len(cities_to_search),
        "new_leads_added": new_leads,
        "duplicates_skipped": skipped_dupes,
        "skipped_has_website": skipped_has_website,
        "errors": errors,
        "duration_seconds": duration_ms / 1000,
    }
