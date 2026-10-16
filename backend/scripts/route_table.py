"""Write docs/ROUTES_AND_ROLES.md: every route with who may call it (read from the code).

Run from backend/:  .venv/Scripts/python scripts/route_table.py
"""

from pathlib import Path
from typing import Any

from app.main import app


def _who(dep: Any, out: set[str]) -> None:
    for d in dep.dependencies:
        name = getattr(d.call, "__name__", "")
        if name == "get_current_user":
            out.add("signed-in")
        elif name == "_guard" and d.call.__closure__:
            for cell in d.call.__closure__:
                if isinstance(cell.cell_contents, tuple):
                    roles = "/".join(str(getattr(x, "value", x)) for x in cell.cell_contents)
                    out.add("role:" + roles)
        _who(d, out)


def main() -> None:
    rows = []
    for r in app.routes:
        for c in r.effective_route_contexts() if hasattr(r, "effective_route_contexts") else []:
            out: set[str] = set()
            _who(c.dependant or c.original_route.dependant, out)
            roles = sorted(x for x in out if x.startswith("role:"))
            who = roles[0][5:] if roles else ("any signed-in user" if out else "nobody (public)")
            for method in sorted(c.methods - {"HEAD", "OPTIONS"}):
                rows.append((c.path.replace("/api/v1", ""), method, who))
    rows.sort()
    lines = [
        "# Routes and who may call them",
        "",
        "Written by `backend/scripts/route_table.py` from the running code; the test",
        "`tests/modules/test_authorization_matrix.py` checks every row below (no token = 401,",
        "wrong role = 403, another person's thing = 404, same as a missing one).",
        "",
        "| Method | Path | Who |",
        "|---|---|---|",
    ]
    lines += [f"| {m} | `{p}` | {w} |" for p, m, w in rows]
    out_path = Path(__file__).resolve().parents[2] / "docs" / "ROUTES_AND_ROLES.md"
    out_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"{len(rows)} routes written to {out_path}")


if __name__ == "__main__":
    main()
