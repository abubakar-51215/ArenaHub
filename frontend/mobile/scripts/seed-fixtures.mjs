// Seeds the bookings/match fixtures the capture scripts depend on, via the
// real API (not direct DB writes) so the data goes through the same
// validation the app relies on. Calls are throttled (400ms spacing, retry
// with backoff on 429) because the dev backend rate-limits auth and booking
// endpoints.
const API = "http://127.0.0.1:8000/api/v1";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const j = async (p, t, o = {}) => {
  await sleep(400);
  for (let k = 0; k < 6; k++) {
    const r = await fetch(API + p, {
      ...o,
      headers: { "Content-Type": "application/json", ...(t ? { Authorization: "Bearer " + t } : {}) },
    });
    if (r.status === 429) {
      await sleep(+(r.headers.get("retry-after") || 5) * 1000 + 500);
      continue;
    }
    return { status: r.status, ...(await r.json()) };
  }
  return { status: 429, data: null };
};

const login = async (e, p) => (await j("/auth/login", null, { method: "POST", body: JSON.stringify({ email: e, password: p }) })).data.access_token;
const iso = (d) => d.toISOString().slice(0, 10);

(async () => {
  const ot = await login("owner@arenahub.pk", "Owner@1234");
  const pt = await login("sara.khan@example.com", "Player@1234");

  const arenas = (await j("/owner/arenas?page_size=50", ot)).data.items;
  const arena = arenas.find((a) => a.name === "Arena Hub Gulberg Lahore");
  const courts = (await j(`/owner/arenas/${arena.id}/courts`, ot)).data;
  const court = courts.find((c) => c.is_available);
  console.log("arena/court:", arena.name, court.name, court.id);

  const from = new Date();
  const to = new Date(Date.now() + 6 * 864e5);
  const g = await j(`/owner/courts/${court.id}/slots/generate`, ot, {
    method: "POST",
    body: JSON.stringify({ start_date: iso(from), end_date: iso(to) }),
  });
  console.log("generate:", g.status, JSON.stringify(g.data));

  // Pick slots a couple of days out so capture-baselines.mjs's slotDate can
  // be updated to match.
  const d = iso(new Date(Date.now() + 2 * 864e5));
  const slots = (await j(`/courts/${court.id}/slots?date=${d}`, pt)).data;
  const avail = slots.filter((s) => s.status === "available");
  console.log("avail slots on", d, ":", avail.length, "sample", JSON.stringify(avail[0]));
  const evening = avail.filter((s) => s.start_time >= "17:00:00").slice(0, 3);
  if (evening.length < 2) {
    console.log("not enough evening slots");
    return;
  }

  const b1 = await j("/bookings", pt, { method: "POST", body: JSON.stringify({ court_id: court.id, slot_ids: [evening[0].id], payment_type: "full" }) });
  console.log("booking1 (pending):", b1.status, b1.message, b1.data && b1.data.booking_group_id);

  const b2 = await j("/bookings", pt, { method: "POST", body: JSON.stringify({ court_id: court.id, slot_ids: [evening[1].id], payment_type: "full" }) });
  console.log("booking2:", b2.status, b2.message, b2.data && b2.data.booking_group_id);
  if (b2.data) {
    const init = await j("/payments/initiate", pt, { method: "POST", body: JSON.stringify({ booking_group_id: b2.data.booking_group_id, payment_method: "card" }) });
    console.log("initiate:", init.status, init.message, JSON.stringify(init.data).slice(0, 200));
    const pid = init.data && (init.data.payment_id || init.data.id || (init.data.payment && init.data.payment.id));
    if (pid) {
      const sc = await j(`/payments/${pid}/simulate-confirm?success=true`, pt, { method: "POST" });
      console.log("simulate-confirm:", sc.status, sc.message, sc.data && sc.data.status);
    }
  }

  const m = await j("/matches", pt, {
    method: "POST",
    body: JSON.stringify({ arena_id: arena.id, court_id: court.id, sport: "futsal", match_date: d, start_time: "20:00:00", end_time: "21:00:00", max_players: 10 }),
  });
  console.log("match:", m.status, m.message, m.data && m.data.id);

  console.log(JSON.stringify({ arenaId: arena.id, courtId: court.id, date: d, groupPending: b1.data && b1.data.booking_group_id }));
})();
