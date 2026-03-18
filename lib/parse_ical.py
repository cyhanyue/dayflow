#!/usr/bin/env python3
"""
parse_ical.py — Parse an iCalendar (.ics) feed into a JSON list of event instances.

Usage:
    python3 parse_ical.py <user_email|null> <window_start_iso> <window_end_iso> < input.ics

Output: JSON array on stdout, or {"error": "..."} on failure.

Logic (RFC 5545):
  - Detects owner email as the most-frequent ATTENDEE address in the feed.
  - Includes a VEVENT if:
      (a) it has no attendees (personal/private calendar), OR
      (b) the ORGANIZER's cal-address matches the owner email, OR
      (c) the owner appears as an ATTENDEE with PARTSTAT=ACCEPTED.
  - Recurring events are expanded via recurring-ical-events (handles EXDATE,
    RECURRENCE-ID overrides automatically).
"""

import sys
import json
from collections import Counter
from datetime import datetime, timezone, date as date_type, timedelta


def main():
    try:
        from icalendar import Calendar
        import recurring_ical_events
    except ImportError as e:
        sys.stdout.write(json.dumps({
            "error": f"Missing Python dependency: {e}. Run: pip install icalendar recurring-ical-events"
        }))
        sys.exit(1)

    if len(sys.argv) < 4:
        sys.stdout.write(json.dumps({
            "error": "Usage: parse_ical.py <user_email|null> <window_start_iso> <window_end_iso>"
        }))
        sys.exit(1)

    user_email_arg = sys.argv[1] if sys.argv[1] != "null" else None

    try:
        window_start = datetime.fromisoformat(sys.argv[2].replace("Z", "+00:00"))
        window_end = datetime.fromisoformat(sys.argv[3].replace("Z", "+00:00"))
        if window_start.tzinfo is None:
            window_start = window_start.replace(tzinfo=timezone.utc)
        if window_end.tzinfo is None:
            window_end = window_end.replace(tzinfo=timezone.utc)
    except ValueError as e:
        sys.stdout.write(json.dumps({"error": f"Invalid date arguments: {e}"}))
        sys.exit(1)

    raw = sys.stdin.buffer.read()

    try:
        cal = Calendar.from_ical(raw)
    except Exception as e:
        sys.stdout.write(json.dumps({"error": f"Failed to parse iCal data: {e}"}))
        sys.exit(1)

    owner_email = detect_owner_email(cal, None)
    print(f"[parse_ical] owner_email={owner_email}", file=sys.stderr)

    try:
        components = recurring_ical_events.of(cal).between(window_start, window_end)
    except Exception as e:
        sys.stdout.write(json.dumps({"error": f"Failed to expand recurrences: {e}"}))
        sys.exit(1)

    results = []
    excluded = []
    for comp in components:
        if str(comp.name) != "VEVENT":
            continue
        reason = include_reason(comp, owner_email)
        if reason is None:
            title = str(comp.get("SUMMARY", "")).strip()
            start = str(comp.get("DTSTART", ""))
            organizer = normalize_email(comp.get("ORGANIZER", "")) if comp.get("ORGANIZER") else "(none)"
            attendees_raw = comp.get("ATTENDEE", [])
            if not isinstance(attendees_raw, list):
                attendees_raw = [attendees_raw]
            my_att = next((a for a in attendees_raw if normalize_email(a) == owner_email), None)
            partstat = ""
            if my_att is not None:
                params = my_att.params if hasattr(my_att, "params") else {}
                partstat = str(params.get("PARTSTAT", "(missing)"))
            all_emails = [normalize_email(a) for a in attendees_raw]
            excluded.append(
                f"  EXCLUDED: {title!r} @ {start}\n"
                f"    owner_email={owner_email}\n"
                f"    organizer={organizer}\n"
                f"    my_partstat={partstat or '(not in attendees)'}\n"
                f"    all_attendees={all_emails}"
            )
            continue
        event = vevent_to_dict(comp)
        if event is not None:
            results.append(event)

    if excluded:
        print(f"[parse_ical] {len(excluded)} events excluded:", file=sys.stderr)
        for line in excluded[:20]:
            print(line, file=sys.stderr)

    sys.stdout.write(json.dumps(results, default=str))


# ── Helpers ────────────────────────────────────────────────────────────────


def normalize_email(val) -> str:
    """Strip 'mailto:' prefix and lowercase the address."""
    s = str(val) if not isinstance(val, str) else val
    return s.lower().replace("mailto:", "").strip()


def nodot_local(email: str) -> str:
    """Return 'local@domain' with dots stripped from the local part (Google dot-insensitivity)."""
    parts = email.split("@", 1)
    return parts[0].replace(".", "") + "@" + parts[1] if len(parts) == 2 else email


def detect_owner_email(cal, user_email_hint: str | None) -> str | None:
    """
    Identify the owner as the most frequently appearing ATTENDEE email
    across all VEVENTs in the feed. This is the most reliable signal because
    the owner appears in virtually every event they are part of.

    user_email_hint is ignored — frequency is the authoritative signal.
    """
    counts: Counter = Counter()
    for comp in cal.walk("VEVENT"):
        attendees = comp.get("ATTENDEE", [])
        if not isinstance(attendees, list):
            attendees = [attendees]
        for att in attendees:
            e = normalize_email(att)
            if "@" in e:
                counts[e] += 1

    return counts.most_common(1)[0][0] if counts else None


def include_reason(comp, owner_email: str | None) -> str | None:
    """
    Returns a non-None string (the reason) if the event should be included,
    or None if it should be excluded.

    Rules (per RFC 5545):
    1. ORGANIZER match → always include.
    2. ATTENDEE match (not organizer):
         ACCEPTED → include; all others (NEEDS-ACTION, DECLINED, TENTATIVE,
         DELEGATED, missing) → exclude.
    3. Neither ORGANIZER nor ATTENDEE → personal event, include.
    4. Owner email unknown → include everything.
    """
    if owner_email is None:
        return "no-owner-filter"

    attendees_raw = comp.get("ATTENDEE", [])
    if not isinstance(attendees_raw, list):
        attendees_raw = [attendees_raw]

    organizer_raw = comp.get("ORGANIZER")

    # Rule 3: no attendees and no organizer → personal event
    if not attendees_raw and organizer_raw is None:
        return "personal-event"

    # Rule 1: user is the organizer → always include
    if organizer_raw is not None:
        if normalize_email(organizer_raw) == owner_email:
            return "organizer"

    # Rule 2: user is an attendee (but not the organizer)
    for att in attendees_raw:
        if normalize_email(att) == owner_email:
            params = att.params if hasattr(att, "params") else {}
            partstat = str(params.get("PARTSTAT", "")).upper()
            if partstat == "ACCEPTED":
                return "attendee-accepted"
            return None  # NEEDS-ACTION, DECLINED, TENTATIVE, DELEGATED, or missing

    # Rule 3 (partial): has organizer but no attendees → personal-style
    if not attendees_raw:
        return "personal-no-attendees"

    # User not listed at all → exclude
    return None


def to_utc(dt) -> datetime | None:
    """Convert an icalendar date/datetime value to a UTC-aware datetime."""
    if dt is None:
        return None
    if isinstance(dt, datetime):
        if dt.tzinfo is None:
            return dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    if isinstance(dt, date_type):
        return datetime(dt.year, dt.month, dt.day, tzinfo=timezone.utc)
    return None


def is_all_day(dtstart_prop) -> bool:
    val = dtstart_prop.dt if hasattr(dtstart_prop, "dt") else dtstart_prop
    return isinstance(val, date_type) and not isinstance(val, datetime)


def vevent_to_dict(comp) -> dict | None:
    """Serialize a VEVENT component to a plain dict for JSON output."""
    dtstart_prop = comp.get("DTSTART")
    dtend_prop = comp.get("DTEND") or comp.get("DUE")

    if dtstart_prop is None:
        return None

    all_day = is_all_day(dtstart_prop)
    start_dt = to_utc(dtstart_prop.dt if hasattr(dtstart_prop, "dt") else dtstart_prop)

    if dtend_prop is None:
        end_dt = (start_dt + timedelta(days=1)) if all_day else start_dt
    else:
        end_dt = to_utc(dtend_prop.dt if hasattr(dtend_prop, "dt") else dtend_prop)

    if start_dt is None or end_dt is None:
        return None

    # Skip hard-cancelled events
    status_raw = str(comp.get("STATUS", "CONFIRMED")).upper()
    if status_raw == "CANCELLED":
        return None
    status = "tentative" if status_raw == "TENTATIVE" else "confirmed"

    # Organizer: prefer CN display name, fall back to email
    organizer_raw = comp.get("ORGANIZER")
    organizer_str = None
    if organizer_raw is not None:
        params = organizer_raw.params if hasattr(organizer_raw, "params") else {}
        cn = str(params.get("CN", "")).strip()
        organizer_str = cn if cn else normalize_email(organizer_raw)

    # Attendees: display name (CN) or email, excluding DECLINED
    attendees_raw = comp.get("ATTENDEE", [])
    if not isinstance(attendees_raw, list):
        attendees_raw = [attendees_raw]
    formatted_attendees = []
    for att in attendees_raw:
        params = att.params if hasattr(att, "params") else {}
        if str(params.get("PARTSTAT", "")).upper() == "DECLINED":
            continue
        cn = str(params.get("CN", "")).strip()
        formatted_attendees.append(cn if cn else normalize_email(att))

    uid = str(comp.get("UID", "")).strip() or None
    title = str(comp.get("SUMMARY", "(No title)")).strip() or "(No title)"
    description = str(comp.get("DESCRIPTION", "")).strip() or None
    location = str(comp.get("LOCATION", "")).strip() or None

    return {
        "uid": uid,
        "title": title,
        "description": description,
        "location": location,
        "organizer": organizer_str,
        "attendees": formatted_attendees,
        "startDatetime": start_dt.isoformat(),
        "endDatetime": end_dt.isoformat(),
        "isAllDay": all_day,
        "status": status,
    }


# ── Rescheduling helper ────────────────────────────────────────────────────


def build_rescheduled_instance_vevent(
    master_uid: str,
    original_dtstart: datetime,
    new_dtstart: datetime,
    new_dtend: datetime,
    master_sequence: int = 0,
    summary: str = "",
    description: str | None = None,
    location: str | None = None,
    organizer: str | None = None,
    attendees: list[str] | None = None,
) -> str:
    """
    Build a single override VEVENT that reschedules one instance of a recurring event.

    Per RFC 5545 §3.8.4.4:
      - Same UID as the master series.
      - RECURRENCE-ID = original instance's DTSTART (tells the engine which
        occurrence this overrides; the old time slot is implicitly removed).
      - New DTSTART / DTEND at the rescheduled time.
      - SEQUENCE incremented by 1 from the master's current SEQUENCE.
      - All other fields (SUMMARY, DESCRIPTION, LOCATION, ORGANIZER, ATTENDEEs)
        carried over from the master.

    This is the standard RFC 5545 way to move a recurring instance.
    Returns a VCALENDAR-wrapped iCal string ready to be merged into the feed.
    """
    try:
        from icalendar import Calendar, Event
    except ImportError:
        raise RuntimeError("icalendar package required: pip install icalendar")

    def ensure_utc(dt: datetime) -> datetime:
        return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt

    original_dtstart = ensure_utc(original_dtstart)
    new_dtstart = ensure_utc(new_dtstart)
    new_dtend = ensure_utc(new_dtend)

    cal = Calendar()
    cal.add("PRODID", "-//Dayflow//Dayflow//EN")
    cal.add("VERSION", "2.0")

    evt = Event()
    evt.add("UID", master_uid)
    evt.add("RECURRENCE-ID", original_dtstart)
    evt.add("SEQUENCE", master_sequence + 1)
    evt.add("DTSTART", new_dtstart)
    evt.add("DTEND", new_dtend)

    if summary:
        evt.add("SUMMARY", summary)
    if description:
        evt.add("DESCRIPTION", description)
    if location:
        evt.add("LOCATION", location)
    if organizer:
        evt.add("ORGANIZER", f"mailto:{organizer}" if "@" in organizer and not organizer.startswith("mailto:") else organizer)
    for att in (attendees or []):
        evt.add("ATTENDEE", f"mailto:{att}" if "@" in att and not att.startswith("mailto:") else att)

    cal.add_component(evt)
    return cal.to_ical().decode("utf-8")


if __name__ == "__main__":
    main()
