// Checks that the public pages never point anyone at the admin panel.
// /admin/login stays reachable by typing the URL; it is just not linked.
//
// 1. Source: the public page files must not contain "/admin".
// 2. Rendered HTML: /, /login and /register (from a running build, BASE_URL,
//    default http://localhost:3000) must not link to /admin: no href to it,
//    in the HTML or in the page payload Next embeds. (The bare string appears
//    in every page's head: the admin theme script checks the path.)
//
// Usage: npm run check:no-admin-links            (source + rendered)
//        BASE_URL=http://localhost:3102 npm run check:no-admin-links
//        SKIP_RENDERED=1 npm run check:no-admin-links   (source only)
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const failures = [];

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

// the welcome page and the public sign-in / sign-up screens
const sources = [join(root, "app", "page.tsx"), ...walk(join(root, "app", "(auth)"))].filter((f) =>
  /\.(tsx?|jsx?)$/.test(f),
);
for (const file of sources) {
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((line, i) => {
      if (line.includes("/admin"))
        failures.push(`source ${file.slice(root.length)}:${i + 1}: ${line.trim()}`);
    });
}

if (!process.env.SKIP_RENDERED) {
  const base = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  for (const route of ["/", "/login", "/register"]) {
    let html;
    try {
      const res = await fetch(base + route);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      html = await res.text();
    } catch (err) {
      failures.push(`rendered ${route}: could not load ${base + route} (${err.message})`);
      continue;
    }
    // href="/admin…" in the HTML, or "href":"/admin…" (escaped or not) in the payload
    const link = /href=\\?"\/admin|href\\?"\s*:\s*\\?"\/admin/;
    const m = link.exec(html);
    if (m)
      failures.push(
        `rendered ${route}: link to /admin: …${html.slice(Math.max(0, m.index - 60), m.index + 50)}…`,
      );
  }
}

if (failures.length) {
  console.error(`Admin links found on public pages (${failures.length}):`);
  for (const f of failures) console.error("  " + f);
  process.exit(1);
}
console.log(
  `No admin links on public pages (${sources.length} source files${process.env.SKIP_RENDERED ? "" : "; /, /login, /register rendered"}).`,
);
