// Stage 2 of the QA run: after the scratch backend was stopped and started again with a payment
// still pending (left by scripts/qa_api.mjs), the booking and the payment must still be there,
// and the late signed callback must still confirm it exactly once.
import crypto from "node:crypto";
import fs from "node:fs";
import { API, api, sql } from "./lib/verify-kit.mjs";

const st = JSON.parse(fs.readFileSync("docs/qa/.restart_state.json", "utf-8"));
const results = JSON.parse(fs.readFileSync("docs/qa/qa_results.json", "utf-8"));
const add = (r) => { results.push(r); console.log(`[${r.status}] ${r.id} ${r.title} -- ${r.actual}`); };
const q1 = (t) => sql(t).trim();

let login;
for (const password of ["Verify@12345", "Verify@67890"]) {
  const r = await api("/auth/login", null, { method: "POST", raw: true, body: JSON.stringify({ email: st.playerEmail, password }) });
  if (r.status === 200) { login = r.body.data; break; }
}
const tok = login.access_token;
const before = await api(`/bookings/group/${st.group}`, tok);
const pay = await api(`/payments/by-group/${st.group}`, tok);
const body = JSON.stringify({ gateway_transaction_id: st.payment.gateway_transaction_id, status: "completed", amount: st.payment.amount, currency: st.payment.currency });
const sig = crypto.createHmac("sha256", "qa-fake-jazz").update(body).digest("hex");
const hook = await fetch(`${API}/webhooks/jazzcash`, { method: "POST", headers: { "Content-Type": "application/json", "X-Signature": sig }, body });
const hook2 = await fetch(`${API}/webhooks/jazzcash`, { method: "POST", headers: { "Content-Type": "application/json", "X-Signature": sig }, body });
const after = await api(`/bookings/group/${st.group}`, tok);
const rows = q1(`select count(*) from payments where booking_group_id='${st.group}' and status='completed'`);
const slot = q1(`select status from time_slots where id='${st.slot}'`);
const good = before.status === "pending_payment" && hook.status === 200 && hook2.status === 200 && after.status === "confirmed" && rows.includes("(1,") && slot.includes("booked");
add({
  id: "C03", role: "all", title: "Backend restart while a payment is pending",
  expected: "After the restart the pending booking and payment are still there; the late signed callback confirms once",
  actual: `After restart: booking ${before.status}, payment found (${pay?.id ? "yes" : "no"}). Signed callback ${hook.status}, repeat ${hook2.status} -> booking ${after.status}; completed payments ${rows}; slot ${slot}`,
  status: good ? "PASS" : "FAIL", evidence: "Backend process stopped and started between the two scripts", severity: good ? "" : "High",
});
fs.writeFileSync("docs/qa/qa_results.json", JSON.stringify(results, null, 1));
