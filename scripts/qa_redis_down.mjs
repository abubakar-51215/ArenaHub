// Redis is unreachable (a second scratch backend on :8002 pointed at a closed port; the real Redis
// is untouched). What do health, sign-in, search and a booking do? A booking must not double-book
// and must not 500; ideally it says "try again".
import fs from "node:fs";
import { sql } from "./lib/verify-kit.mjs";

const API2 = "http://127.0.0.1:8002/api/v1";
const results = JSON.parse(fs.readFileSync("docs/qa/qa_results.json", "utf-8"));
const call = async (p, tok, method = "GET", body) => {
  const r = await fetch(API2 + p, { method, headers: { "Content-Type": "application/json", ...(tok ? { Authorization: `Bearer ${tok}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const row = sql("select c.id, s.id from courts c join time_slots s on s.court_id=c.id where s.status='available' and s.date > current_date order by s.date desc limit 1");
const [court, slot] = [...row.matchAll(/UUID\('([0-9a-f-]+)'\)/g)].map((m) => m[1]);
const email = "qa8-player@example.com";
let tok;
let login;
for (const password of ["Verify@67890", "Verify@12345"]) {
  login = await call("/auth/login", null, "POST", { email, password });
  if (login.status === 200) { tok = login.body.data.access_token; break; }
}
const health = await call("/health");
const search = await call("/arenas?sport=futsal");
const book = tok ? await call("/bookings", tok, "POST", { court_id: court, slot_ids: [slot], payment_type: "full" }) : { status: "no token" };
const rows = sql(`select count(*) from bookings where slot_id='${slot}' and status not in ('cancelled','rejected')`).trim();
const safe = book.status !== 200 && book.status !== 500 && rows.includes("(0,");
results.push({
  id: "C04", role: "all", title: "Redis unavailable (second backend, closed Redis port)",
  expected: "Health says degraded; no double booking and no 500 when the slot lock cannot be taken",
  actual: `Health HTTP ${health.status} (redis: ${health.body.data?.redis}); sign-in ${login.status}; arena search ${search.status}; booking ${book.status} "${book.body.message ?? ""}"; active bookings on that slot afterwards: ${rows}`,
  status: safe && health.body.data?.redis === "error" ? "PASS" : "FAIL",
  evidence: "scratch backend on :8002 with REDIS_URL pointing at a closed port",
  severity: safe ? "" : "High",
});
fs.writeFileSync("docs/qa/qa_results.json", JSON.stringify(results, null, 1));
console.log(results.at(-1).status, results.at(-1).actual);
