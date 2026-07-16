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
    SlotGenerateRequest,
    SlotGenerateResult,
    SlotResponse,
    SlotUpdate,
)
from app.modules.user.model import User
from app.shared.pricing import resolve_peak_price
from app.websocket.manager import broadcast_slot_status

SLOT_LENGTH = timedelta(hours=1)

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
    db: AsyncSession, court_id: uuid.UUID, target_date: date
) -> list[SlotResponse]:
    court = await court_repo.get_court(db, court_id)
    if court is None or not court.is_available:
        raise NotFoundError("Court not found.")
    rows = await repo.list_slots(db, court_id, target_date)
    return [SlotResponse.model_validate(r) for r in rows]


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
    await broadcast_slot_status(
        court_id, slot.id, slot.date, slot.start_time, slot.status.value
    )
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
