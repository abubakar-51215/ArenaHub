"""Slot business logic: auto-generate from arena operating hours, manual
edit, and disable/block — all gated on ownership of the parent court/arena.
"""

import uuid
from datetime import date, datetime, time, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ForbiddenError, NotFoundError, ValidationError
from app.modules.arena import repository as arena_repo
from app.modules.arena.model import Arena
from app.modules.court import repository as court_repo
from app.modules.court.model import Court
from app.modules.slot import repository as repo
from app.modules.slot.model import SlotStatus, TimeSlot
from app.modules.slot.schema import (
    CourtToday,
    DayAvailability,
    SlotGenerateRequest,
    SlotGenerateResult,
    SlotResponse,
    SlotUpdate,
)
from app.modules.user.model import User
from app.shared.pricing import resolve_peak_price
from app.websocket.manager import broadcast_slot_status

SLOT_LENGTH = timedelta(hours=1)
MAX_AVAILABILITY_DAYS = 31


def _now() -> datetime:
    """The arena's local time (slots are stored as local dates and times)."""
    return datetime.now()


_WEEKDAY_NAMES = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
]


async def _owned_court_and_arena(
    db: AsyncSession, court_id: uuid.UUID, user: User
) -> tuple[Court, Arena]:
    court = await court_repo.get_court(db, court_id)
    if court is None:
        raise NotFoundError("Court not found.")
    arena = await arena_repo.get_arena(db, court.arena_id)
    if arena is None:
        raise NotFoundError("Arena not found.")
    if arena.owner_id != user.id:
        raise ForbiddenError("You do not own this arena.")
    return court, arena


def _parse_hours(raw: dict, day_name: str) -> tuple[time, time] | None:
    """Return (open, close) for ``day_name``, or None if the arena is closed."""
    window = raw.get(day_name)
    if not window:
        return None
    return (
        datetime.strptime(window["open"], "%H:%M").time(),
        datetime.strptime(window["close"], "%H:%M").time(),
    )


def _hourly_starts(open_time: time, close_time: time) -> list[time]:
    starts = []
    cursor = datetime.combine(date.min, open_time)
    end = datetime.combine(date.min, close_time)
    while cursor + SLOT_LENGTH <= end:
        starts.append(cursor.time())
        cursor += SLOT_LENGTH
    return starts


async def generate_slots(
    db: AsyncSession, user: User, court_id: uuid.UUID, data: SlotGenerateRequest
) -> SlotGenerateResult:
    court, arena = await _owned_court_and_arena(db, court_id, user)
    # an admin-suspended or removed arena cannot put new slots on sale
    if arena.is_suspended:
        raise ValidationError("This arena is suspended by ArenaHub; slots cannot be generated.")
    if arena.is_deleted:
        raise ValidationError("This arena was removed by ArenaHub.")
    blocked_dates = {b.blocked_date for b in await arena_repo.list_blocked_dates(db, arena.id)}
    pricing_rules = await court_repo.list_pricing_rules(db, court_id)

    created = 0
    skipped_existing = 0
    skipped_closed_or_blocked: list[date] = []
    skipped_window_too_short: list[date] = []

    cursor = data.start_date
    while cursor <= data.end_date:
        if cursor in blocked_dates:
            skipped_closed_or_blocked.append(cursor)
            cursor += timedelta(days=1)
            continue

        day_name = _WEEKDAY_NAMES[cursor.weekday()]
        hours = _parse_hours(arena.operating_hours, day_name)
        if hours is None:
            skipped_closed_or_blocked.append(cursor)
            cursor += timedelta(days=1)
            continue

        open_time, close_time = hours
        starts = _hourly_starts(open_time, close_time)
        if not starts:
            # Open per operating_hours (close > open is enforced at the
            # schema level, so this isn't an overnight window) but the
            # window is under an hour — surface it instead of silently
            # producing zero slots for a day that looks "open."
            skipped_window_too_short.append(cursor)
            cursor += timedelta(days=1)
            continue

        existing = await repo.existing_start_times(db, court_id, cursor)
        for start in starts:
            if start in existing:
                skipped_existing += 1
                continue
            end = (datetime.combine(date.min, start) + SLOT_LENGTH).time()
            price = resolve_peak_price(court.base_price, pricing_rules, cursor.isoweekday(), start)
            await repo.add_slot(
                db,
                TimeSlot(
                    court_id=court_id,
                    date=cursor,
                    start_time=start,
                    end_time=end,
                    status=SlotStatus.available,
                    price=price,
                ),
            )
            created += 1
        cursor += timedelta(days=1)

    await db.commit()
    return SlotGenerateResult(
        created=created,
        skipped_existing=skipped_existing,
        skipped_closed_or_blocked=skipped_closed_or_blocked,
        skipped_window_too_short=skipped_window_too_short,
    )


async def list_owner_slots(
    db: AsyncSession, user: User, court_id: uuid.UUID, target_date: date
) -> list[SlotResponse]:
    await _owned_court_and_arena(db, court_id, user)
    rows = await repo.list_slots(db, court_id, target_date)
    return [SlotResponse.model_validate(r) for r in rows]


async def list_public_slots(
    db: AsyncSession, court_id: uuid.UUID, target_date: date, now: datetime | None = None
) -> list[SlotResponse]:
    """The slots a player can still book on a day. Slots that have already started (all of an
    earlier day, and the past hours of today, in Karachi time = the server clock) are not listed.
    The owner's own list (``list_owner_slots``) still shows every slot."""
    court = await court_repo.get_court(db, court_id)
    if court is None or not court.is_available:
        raise NotFoundError("Court not found.")
    # slots of an arena an admin suspended or removed are not offered, so the
    # slots its cancelled bookings freed are not sold again (booking itself
    # already requires a live arena)
    arena = await arena_repo.get_arena(db, court.arena_id)
    if arena is None or arena.is_suspended or arena.is_deleted:
        raise NotFoundError("Court not found.")
    # a day the owner blocked has no slots for players, even ones made before the block
    if target_date in await _blocked_dates(db, arena.id):
        return []
    current = now or datetime.now()
    rows = await repo.list_slots(db, court_id, target_date)
    return [
        SlotResponse.model_validate(r)
        for r in rows
        if datetime.combine(r.date, r.start_time) > current
    ]


async def _blocked_dates(db: AsyncSession, arena_id: uuid.UUID) -> set[date]:
    return {b.blocked_date for b in await arena_repo.list_blocked_dates(db, arena_id)}


async def _public_court(db: AsyncSession, court_id: uuid.UUID) -> Court:
    court = await court_repo.get_court(db, court_id)
    if court is None or not court.is_available:
        raise NotFoundError("Court not found.")
    arena = await arena_repo.get_arena(db, court.arena_id)
    if arena is None or arena.is_suspended or arena.is_deleted:
        raise NotFoundError("Court not found.")
    return court


async def court_availability(
    db: AsyncSession, court_id: uuid.UUID, start: date, end: date
) -> list[DayAvailability]:
    """Open slot count for each date from ``start`` to ``end`` (zero for a day
    with none), for the 7-day strip. At most 31 days."""
    if end < start:
        raise ValidationError("'to' must be on or after 'from'.")
    if (end - start).days >= MAX_AVAILABILITY_DAYS:
        raise ValidationError(f"Ask for at most {MAX_AVAILABILITY_DAYS} days at a time.")
    court = await _public_court(db, court_id)
    now = _now()
    counts = await repo.open_counts_by_date(db, court_id, start, end, now.date(), now.time())
    for blocked in await _blocked_dates(db, court.arena_id):
        counts.pop(blocked, None)
    return [
        DayAvailability(
            date=start + timedelta(days=i), open_count=counts.get(start + timedelta(days=i), 0)
        )
        for i in range((end - start).days + 1)
    ]


async def arena_slots_today(db: AsyncSession, arena_id: uuid.UUID) -> list[CourtToday]:
    """Per bookable court of a live arena: open slots left today and the lowest
    price among them (the Arena screen's Courts rows)."""
    arena = await arena_repo.get_arena(db, arena_id)
    if arena is None or not arena.is_live:
        raise NotFoundError("Arena not found.")
    courts = await court_repo.list_courts(db, arena_id, available_only=True)
    now = _now()
    left = await repo.open_today_by_court(db, [c.id for c in courts], now.date(), now.time())
    if now.date() in await _blocked_dates(db, arena_id):
        left = {}
    return [
        CourtToday(
            court_id=c.id,
            open_count=left.get(c.id, (0, None))[0],
            lowest_price=left[c.id][1] if c.id in left else None,
        )
        for c in courts
    ]


async def _owned_slot(
    db: AsyncSession, user: User, court_id: uuid.UUID, slot_id: uuid.UUID
) -> TimeSlot:
    await _owned_court_and_arena(db, court_id, user)
    slot = await repo.get_slot(db, slot_id)
    if slot is None or slot.court_id != court_id:
        raise NotFoundError("Slot not found.")
    return slot


_HAS_BOOKING_STATUSES = (SlotStatus.booked, SlotStatus.reserved)


async def update_slot(
    db: AsyncSession, user: User, court_id: uuid.UUID, slot_id: uuid.UUID, data: SlotUpdate
) -> SlotResponse:
    slot = await _owned_slot(db, user, court_id, slot_id)
    if slot.status in _HAS_BOOKING_STATUSES:
        raise ValidationError("Cannot edit a slot that has an active booking.")
    fields = data.model_dump(exclude_unset=True)
    for field, value in fields.items():
        setattr(slot, field, value)
    await db.commit()
    await broadcast_slot_status(court_id, slot.id, slot.date, slot.start_time, slot.status.value)
    return SlotResponse.model_validate(slot)


async def delete_slot(
    db: AsyncSession, user: User, court_id: uuid.UUID, slot_id: uuid.UUID
) -> None:
    slot = await _owned_slot(db, user, court_id, slot_id)
    if slot.status in _HAS_BOOKING_STATUSES:
        raise ValidationError("Cannot delete a slot that has an active booking.")
    slot_id_, slot_date, start_time = slot.id, slot.date, slot.start_time
    await db.delete(slot)
    await db.commit()
    await broadcast_slot_status(court_id, slot_id_, slot_date, start_time, "deleted")
