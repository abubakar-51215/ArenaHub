"""Smart search end to end: the understood parts are applied (sport, area from the arenas'
data, price per hour, free slots at the asked time), echoed as chips, removable, and safe with odd
input."""

from datetime import time, timedelta
from decimal import Decimal

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.ai import service as ai_service
from app.modules.slot.model import SlotStatus, TimeSlot
from tests.helpers import arena_payload, auth_header, make_admin, make_user

NLP = "/api/v1/search/nlp"


async def _arena(
    client: AsyncClient, db: AsyncSession, tag: str, *, price: str, **overrides: object
) -> tuple[str, str]:
    owner, _ = await make_user(client, db, f"ss-{tag}@example.com", "owner")
    h = auth_header(owner)
    res = await client.post("/api/v1/owner/arenas", headers=h, json=arena_payload(**overrides))
    arena_id = res.json()["data"]["id"]
    admin = await make_admin(client, db, f"ss-admin-{tag}@example.com")
    await client.post(f"/api/v1/admin/arenas/{arena_id}/approve", headers=auth_header(admin))
    court = await client.post(
        f"/api/v1/owner/arenas/{arena_id}/courts",
        headers=h,
        json={"name": "Court 1", "sport_types": overrides.get("sports_offered", ["futsal"]),
              "base_price": price},
    )  # fmt: skip
    return arena_id, court.json()["data"]["id"]


async def _slot(db: AsyncSession, court_id: str, day, start: int, status=SlotStatus.available):
    db.add(
        TimeSlot(
            court_id=court_id,
            date=day,
            start_time=time(start, 0),
            end_time=time((start + 1) % 24, 0),
            status=status,
            price=Decimal("2000"),
        )
    )
    await db.commit()


async def _search(client: AsyncClient, q: str, **params) -> dict:
    res = await client.get(NLP, params={"q": q, **params})
    assert res.status_code == 200, res.text
    return res.json()["data"]


async def test_sport_area_price_and_free_slots_tomorrow_evening(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    tomorrow = ai_service._karachi_now().date() + timedelta(days=1)
    free, c_free = await _arena(
        client, db_session, "free", price="2400.00", name="SS Goal Line", area="Gulberg III",
        sports_offered=["futsal"],
    )  # fmt: skip
    busy, c_busy = await _arena(
        client, db_session, "busy", price="2400.00", name="SS Booked Up", area="Gulberg III",
        sports_offered=["futsal"],
    )  # fmt: skip
    dear, c_dear = await _arena(
        client, db_session, "dear", price="4500.00", name="SS Too Dear", area="Gulberg II",
        sports_offered=["futsal"],
    )  # fmt: skip
    away, c_away = await _arena(
        client, db_session, "away", price="2000.00", name="SS Far Away", area="Clifton",
        city="Karachi", sports_offered=["futsal"],
    )  # fmt: skip
    for court in (c_free, c_dear, c_away):
        await _slot(db_session, court, tomorrow, 19)
        await _slot(db_session, court, tomorrow, 20)
    await _slot(db_session, c_free, tomorrow, 9)  # morning: outside "evening"
    await _slot(db_session, c_busy, tomorrow, 19, SlotStatus.booked)

    data = await _search(client, "futsal in gulberg tomorrow evening under 3000")
    parsed = data["parsed"]
    assert [c["label"] for c in parsed["chips"]] == [
        "Futsal",
        "Gulberg",
        "Tomorrow evening",
        "Under ₨ 3,000",
    ]
    names = [i["name"] for i in data["items"]]
    assert names == ["SS Goal Line"]  # not booked up, not too dear, not in Clifton
    row = data["items"][0]
    assert row["free_slots"] == 2 and row["free_slots_text"] == "2 slots tomorrow evening"

    # the time chip removed: free slots no longer matter, the slot words go
    data = await _search(client, "futsal in gulberg tomorrow evening under 3000", drop="time")
    names = {i["name"] for i in data["items"]}
    assert {"SS Goal Line", "SS Booked Up"} <= names and "SS Too Dear" not in names
    assert all(i["free_slots_text"] is None for i in data["items"])
    assert "time" not in [c["kind"] for c in data["parsed"]["chips"]]

    # and the price removed too: the dearer Gulberg II arena comes back
    res = await client.get(
        NLP, params=[("q", "futsal in gulberg tomorrow evening under 3000"), ("drop", "time"),
                     ("drop", "price")],
    )  # fmt: skip
    assert "SS Too Dear" in {i["name"] for i in res.json()["data"]["items"]}


async def test_nothing_matches_says_what_was_understood(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    data = await _search(client, "padel in gulberg tonight under 1000")
    assert data["items"] == [] and data["total"] == 0
    kinds = [c["kind"] for c in data["parsed"]["chips"]]
    assert "price" in kinds and "time" in kinds  # so the screen can offer "Remove price/time"


async def test_not_understood_is_a_plain_name_search(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    await _arena(client, db_session, "name", price="2400.00", name="Goal Line Arena SS")
    data = await _search(client, "goal line")
    assert data["parsed"]["used_fallback_text_search"] is True
    assert data["parsed"]["chips"] == []
    assert "Goal Line Arena SS" in [i["name"] for i in data["items"]]


async def test_places_come_from_the_live_arenas(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    await _arena(
        client, db_session, "bahria", price="2000.00", name="SS Bahria", area="Bahria Town"
    )
    data = await _search(client, "bahria town futsal")
    assert [c["label"] for c in data["parsed"]["chips"]] == ["Futsal", "Bahria Town"]
    assert "SS Bahria" in [i["name"] for i in data["items"]]


async def test_odd_input_never_breaks(client: AsyncClient, db_session: AsyncSession) -> None:
    for q in ["🏸⚽", "بیڈمنٹن لاہور", "x" * 900, "%_\\' or 1=1; --", "a" * 120 + " futsal"]:
        data = await _search(client, q)
        assert len(data["parsed"]["text"]) <= 120
    assert (await client.get(NLP, params={"q": "y" * 1001})).status_code == 422
    assert (await client.get(NLP, params={"q": ""})).status_code == 422


async def test_results_are_capped_and_paged(client: AsyncClient, db_session: AsyncSession) -> None:
    assert (await client.get(NLP, params={"q": "futsal", "page_size": 101})).status_code == 422
    data = await _search(client, "futsal", page_size=1, page=1)
    assert len(data["items"]) <= 1


async def test_cheap_sorts_by_price(client: AsyncClient, db_session: AsyncSession) -> None:
    await _arena(
        client, db_session, "c1", price="3000.00", name="SS Mid", sports_offered=["squash"]
    )
    await _arena(
        client, db_session, "c2", price="1000.00", name="SS Low", sports_offered=["squash"]
    )
    data = await _search(client, "cheap squash")
    names = [i["name"] for i in data["items"] if i["name"].startswith("SS ")]
    assert names[:2] == ["SS Low", "SS Mid"]
    assert data["parsed"]["sort"] == "price_asc"
