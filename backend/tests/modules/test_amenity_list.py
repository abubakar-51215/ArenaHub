"""The one standard amenity list: what is on it, that the server refuses anything else, how an older
typed amenity is mapped to it, the filter by keys, an arena with only older text, and that the old
calls (amenity ids) still behave."""

import re
from pathlib import Path
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.amenities import AMENITY_KEYS, STANDARD_AMENITIES, key_for_old_name
from app.core.messages import AMENITY_EXTRA_CANNOT_ADD, AMENITY_NOT_ON_LIST
from app.modules.arena import repository as arena_repo
from app.modules.arena.model import Arena
from tests.helpers import arena_payload, auth_header, make_admin, make_user

WANTED = [
    "Parking", "Floodlights", "Washrooms", "Changing room", "Drinking water", "Cafeteria", "Wi-Fi",
    "First aid", "Seating", "Shower", "Air conditioning", "Equipment rental", "CCTV", "Prayer area",
]  # fmt: skip


# ---- the list itself ---------------------------------------------------------------------------


def test_the_standard_list_is_the_approved_one_with_no_duplicates() -> None:
    assert [name for _, name in STANDARD_AMENITIES] == WANTED
    keys = [key for key, _ in STANDARD_AMENITIES]
    assert len(keys) == len(set(keys)) == len(AMENITY_KEYS) == 14
    assert all(re.fullmatch(r"[a-z]+(_[a-z]+)*", k) for k in keys)
    names = [name.lower() for _, name in STANDARD_AMENITIES]
    assert len(names) == len(set(names))


async def test_the_list_is_served_in_order_with_ids_and_keys(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    got = (await client.get("/api/v1/arenas/amenities")).json()["data"]
    assert [(a["key"], a["name"]) for a in got] == list(STANDARD_AMENITIES)
    again = (await client.get("/api/v1/arenas/amenities")).json()["data"]
    assert [a["id"] for a in again] == [a["id"] for a in got]  # asking twice adds nothing


# ---- older names -> keys ------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("old", "key"),
    [
        ("Parking", "parking"),
        ("PARKING", "parking"),
        ("parking ", "parking"),
        ("Changing Rooms", "changing_room"),
        ("changing room", "changing_room"),
        ("WiFi", "wifi"),
        ("wi-fi", "wifi"),
        ("Drinking Water", "drinking_water"),
        ("First Aid", "first_aid"),
        ("Washroom", "washrooms"),
        ("cctv", "cctv"),
        ("Cafe", None),
        ("Sauna", None),
        ("", None),
    ],
)
def test_an_older_typed_amenity_maps_to_its_key_or_to_nothing(old: str, key: str | None) -> None:
    assert key_for_old_name(old) == key


def test_the_migration_keeps_the_same_keys_as_the_app() -> None:
    """The migration carries its own copy of the list; a shipped key must never change."""
    text = (
        Path(__file__).parents[2] / "alembic" / "versions" / "e1b9c7a4d2f6_standard_amenity_list.py"
    ).read_text(encoding="utf-8")
    migrated = set(re.findall(r'\("([a-z_]+)", "[^"]+"\),', text))
    assert migrated <= AMENITY_KEYS and len(migrated) == 14


# ---- the server refuses anything that is not on the list ----------------------------------------


async def _owner_arena(
    client: AsyncClient, db: AsyncSession, tag: str, **extra: Any
) -> tuple[dict, str, str]:
    owner, _ = await make_user(client, db, f"am-{tag}@example.com", "owner")
    made = await client.post(
        "/api/v1/owner/arenas",
        headers=auth_header(owner),
        json=arena_payload(name=f"Amenity {tag}", **extra),
    )
    assert made.status_code == 201, made.text
    return auth_header(owner), made.json()["data"]["id"], made.text


async def test_a_key_that_is_not_on_the_list_is_refused_on_create_and_update(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, _ = await make_user(client, db_session, "am-bad@example.com", "owner")
    bad = await client.post(
        "/api/v1/owner/arenas",
        headers=auth_header(owner),
        json=arena_payload(amenities=["parking", "jacuzzi"]),
    )
    assert bad.status_code == 422 and AMENITY_NOT_ON_LIST in bad.text
    h, arena_id, _ = await _owner_arena(client, db_session, "ok", amenities=["parking", "cctv"])
    shown = (await client.get(f"/api/v1/owner/arenas/{arena_id}", headers=h)).json()["data"]
    assert [a["key"] for a in shown["amenities"]] == ["parking", "cctv"]  # kept in list order
    worse = await client.patch(
        f"/api/v1/owner/arenas/{arena_id}", headers=h, json={"amenities": ["Parking"]}
    )  # a display name is not a key
    assert worse.status_code == 422 and AMENITY_NOT_ON_LIST in worse.text
    fine = await client.patch(
        f"/api/v1/owner/arenas/{arena_id}", headers=h, json={"amenities": ["shower", "wifi"]}
    )
    assert [a["key"] for a in fine.json()["data"]["amenities"]] == ["wifi", "shower"]
    cleared = await client.patch(
        f"/api/v1/owner/arenas/{arena_id}", headers=h, json={"amenities": []}
    )
    assert cleared.json()["data"]["amenities"] == []


async def test_old_calls_that_send_amenity_ids_still_work(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    rows = await arena_repo.ensure_standard_amenities(db_session)
    await db_session.commit()
    ids = {a.key: str(a.id) for a in rows}
    h, arena_id, _ = await _owner_arena(client, db_session, "ids", amenity_ids=[ids["parking"]])
    got = (await client.get(f"/api/v1/owner/arenas/{arena_id}", headers=h)).json()["data"]
    assert [a["key"] for a in got["amenities"]] == ["parking"]
    both = await client.patch(
        f"/api/v1/owner/arenas/{arena_id}",
        headers=h,
        json={"amenity_ids": [ids["parking"]], "amenities": ["floodlights"]},
    )
    assert [a["key"] for a in both.json()["data"]["amenities"]] == ["parking", "floodlights"]
    unknown = await client.patch(
        f"/api/v1/owner/arenas/{arena_id}",
        headers=h,
        json={"amenity_ids": ["00000000-0000-0000-0000-000000000000"]},
    )
    assert unknown.status_code == 422 and AMENITY_NOT_ON_LIST in unknown.text
    # an update that says nothing about amenities leaves them alone
    quiet = await client.patch(
        f"/api/v1/owner/arenas/{arena_id}", headers=h, json={"description": "x"}
    )
    assert len(quiet.json()["data"]["amenities"]) == 2


# ---- the filter by keys --------------------------------------------------------------------------


async def _live(client: AsyncClient, db: AsyncSession, tag: str, **extra: Any) -> str:
    h, arena_id, _ = await _owner_arena(client, db, tag, **extra)
    admin = await make_admin(client, db, f"am-admin-{tag}@example.com")
    await client.post(f"/api/v1/admin/arenas/{arena_id}/approve", headers=auth_header(admin))
    return arena_id


async def _names(client: AsyncClient, query: str) -> list[str]:
    got = await client.get(f"/api/v1/arenas?{query}&page_size=50")
    assert got.status_code == 200, got.text
    return sorted(i["name"] for i in got.json()["data"]["items"])


async def test_must_have_by_keys_needs_all_of_them_and_old_calls_still_work(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    await _live(client, db_session, "all3", amenities=["parking", "wifi", "cctv"])
    await _live(client, db_session, "two", amenities=["parking", "wifi"])
    await _live(client, db_session, "one", amenities=["parking"])
    await _live(client, db_session, "none")
    assert await _names(client, "amenities=parking") == [
        "Amenity all3",
        "Amenity one",
        "Amenity two",
    ]
    assert await _names(client, "amenities=parking&amenities=wifi") == [
        "Amenity all3",
        "Amenity two",
    ]
    assert await _names(client, "amenities=parking&amenities=wifi&amenities=cctv") == [
        "Amenity all3"
    ]
    assert await _names(client, "amenities=parking&amenities=shower") == []
    # a key that is not on the list is a mistake, not an empty result
    assert (await client.get("/api/v1/arenas?amenities=jacuzzi")).status_code == 422
    # the id form from the earlier build gives the same answer
    rows = {a.key: str(a.id) for a in await arena_repo.ensure_standard_amenities(db_session)}
    by_id = await _names(client, f"amenity_ids={rows['parking']}&amenity_ids={rows['wifi']}")
    assert by_id == ["Amenity all3", "Amenity two"]
    mixed = await _names(client, f"amenity_ids={rows['parking']}&amenities=cctv")
    assert mixed == ["Amenity all3"]
    # no filter: everything, as before
    assert len(await _names(client, "")) == 4


# ---- an arena with only older text ---------------------------------------------------------

# ---- an arena with only older text --------


async def test_an_arena_with_only_older_text_shows_it_and_the_owner_can_only_remove_it(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    arena_id = await _live(client, db_session, "extra")
    await db_session.execute(
        update(Arena).where(Arena.id == arena_id).values(extra_amenities=["Cafe", "Sauna"])
    )
    await db_session.commit()
    public = (await client.get(f"/api/v1/arenas/{arena_id}")).json()["data"]
    assert public["amenities"] == [] and public["extra_amenities"] == ["Cafe", "Sauna"]
    assert await _names(client, "amenities=parking") == []  # extra text is not a standard amenity
    assert await _names(client, "") == ["Amenity extra"]
    owner_h = auth_header(
        (await make_user(client, db_session, "am-stranger@example.com", "owner"))[0]
    )  # not the owner of this arena
    refused = await client.patch(
        f"/api/v1/owner/arenas/{arena_id}", headers=owner_h, json={"extra_amenities": []}
    )
    assert refused.status_code in (403, 404)


async def test_the_owner_can_take_older_text_off_but_not_add_any(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    h, arena_id, _ = await _owner_arena(client, db_session, "rm")
    await db_session.execute(
        update(Arena).where(Arena.id == arena_id).values(extra_amenities=["Cafe", "Sauna"])
    )
    await db_session.commit()
    added = await client.patch(
        f"/api/v1/owner/arenas/{arena_id}", headers=h, json={"extra_amenities": ["Cafe", "Pool"]}
    )
    assert added.status_code == 422 and AMENITY_EXTRA_CANNOT_ADD in added.text
    kept = await client.patch(
        f"/api/v1/owner/arenas/{arena_id}",
        headers=h,
        json={"amenities": ["parking"], "extra_amenities": ["Sauna"]},
    )
    data = kept.json()["data"]
    assert data["extra_amenities"] == ["Sauna"] and [a["key"] for a in data["amenities"]] == [
        "parking"
    ]
    # saving the form without the field leaves the text alone
    quiet = await client.patch(
        f"/api/v1/owner/arenas/{arena_id}", headers=h, json={"description": "y"}
    )
    assert quiet.json()["data"]["extra_amenities"] == ["Sauna"]
    gone = await client.patch(
        f"/api/v1/owner/arenas/{arena_id}", headers=h, json={"extra_amenities": []}
    )
    assert gone.json()["data"]["extra_amenities"] == []
