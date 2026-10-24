// Renders docs/qa/qa_results.json into docs/qa/QA_TEST_RESULTS.md (every check, every field) and
// prints the PASS/FAIL/BLOCKED/NOT IMPLEMENTED counts for QA_SUMMARY.md.
import fs from "node:fs";

const rows = JSON.parse(fs.readFileSync("docs/qa/qa_results.json", "utf-8"));
const count = (s) => rows.filter((r) => r.status === s).length;
const esc = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");

let md = `# QA test results

Produced by \`scripts/qa_api.mjs\` against the scratch stack (backend :8001, database arenahub_scratch, Redis db 5).
Fake @example.com accounts only. Payment callbacks were signed with fake secrets the scratch backend was started with.

Totals: PASS ${count("PASS")}, FAIL ${count("FAIL")}, BLOCKED ${count("BLOCKED")}, NOT IMPLEMENTED ${count("NOT IMPLEMENTED")} (of ${rows.length} checks).

| Test ID | Role | Check | Expected | Actual | Status | Severity | Evidence |
|---|---|---|---|---|---|---|---|
`;
for (const r of rows) {
  md += `| ${r.id} | ${esc(r.role)} | ${esc(r.title)} | ${esc(r.expected)} | ${esc(r.actual)} | **${r.status}** | ${esc(r.severity)} | ${esc(r.evidence)} |\n`;
}
fs.writeFileSync("docs/qa/QA_TEST_RESULTS.md", md);
console.log(`PASS ${count("PASS")} FAIL ${count("FAIL")} BLOCKED ${count("BLOCKED")} NOT IMPLEMENTED ${count("NOT IMPLEMENTED")} total ${rows.length}`);
