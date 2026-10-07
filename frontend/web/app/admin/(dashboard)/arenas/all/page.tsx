"use client";

import { useState } from "react";
import Link from "next/link";

import { ArenaDetailDialog } from "@/components/admin/arena-detail";
import { CourtArt } from "@/components/admin/court-art";
import { PageHeader } from "@/components/admin/page-header";
import { AdminBadge, AdminEmpty, AdminTag } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useAdminArena, useArenaDirectory } from "@/hooks/useAdmin";
import { ARENA_CITIES, type Arena } from "@/types";

type Status = "" | "live" | "offline" | "pending" | "rejected";

/** Live = approved and selling; Offline = approved but taken offline by the owner. */
function statusOf(a: Arena): Exclude<Status, ""> {
  if (a.status === "pending") return "pending";
  if (a.status === "rejected") return "rejected";
  return a.is_active ? "live" : "offline";
}

const BADGE: Record<
  Exclude<Status, "">,
  { tone: "ok" | "idle" | "wait" | "off"; label: string }
> = {
  live: { tone: "ok", label: "Live" },
  offline: { tone: "idle", label: "Offline" },
  pending: { tone: "wait", label: "Pending review" },
  rejected: { tone: "off", label: "Rejected" },
};

function titleCase(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function ArenaCard({ arena, onOpen }: { arena: Arena; onOpen: () => void }) {
  const st = statusOf(arena);
  return (
    <article className="ah-card ah-court-card">
      <div className="ah-court-vis">
        <CourtArt sport={arena.sports_offered[0]} />
        <span className="ah-court-badge">
          <AdminBadge tone={BADGE[st].tone}>{BADGE[st].label}</AdminBadge>
        </span>
      </div>
      <div className="ah-court-body">
        <div>
          <b className="ah-court-name">{arena.name}</b>
          <div className="ah-sub">{[arena.area, arena.city].filter(Boolean).join(" · ")}</div>
        </div>
        {arena.sports_offered.length > 0 && (
          <div className="ah-court-meta">
            {arena.sports_offered.slice(0, 3).map((s) => (
              <AdminTag key={s}>{titleCase(s)}</AdminTag>
            ))}
          </div>
        )}
        <div className="ah-court-foot">
          <Button variant="outline" size="sm" onClick={onOpen}>
            Open
          </Button>
          {st === "pending" && (
            <Button asChild size="sm" className="ah-lime">
              <Link href="/admin/arenas">Review</Link>
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}

export default function AdminArenaDirectoryPage() {
  const { arenas, totals, isLoading, isError, refetch, truncated } = useArenaDirectory();
  const [city, setCity] = useState("");
  const [sport, setSport] = useState("");
  const [status, setStatus] = useState<Status>("");
  const [openId, setOpenId] = useState<string | null>(null);
  const detail = useAdminArena(openId);
  // the fresh record from GET /admin/arenas/{id}, or the list's copy while it loads
  const opened = openId ? (detail.data ?? arenas.find((a) => a.id === openId) ?? null) : null;

  const sports = [...new Set(arenas.flatMap((a) => a.sports_offered))].sort();
  const shown = arenas.filter(
    (a) =>
      (!city || a.city === city) &&
      (!sport || a.sports_offered.includes(sport)) &&
      (!status || statusOf(a) === status),
  );
  const live = arenas.filter((a) => statusOf(a) === "live").length;
  const offline = arenas.filter((a) => statusOf(a) === "offline").length;

  return (
    <>
      <PageHeader
        title="Arenas"
        subtitle={
          totals
            ? [
                `${live.toLocaleString("en-US")} live`,
                `${totals.pending.toLocaleString("en-US")} pending`,
                offline ? `${offline.toLocaleString("en-US")} offline` : null,
                totals.rejected ? `${totals.rejected.toLocaleString("en-US")} rejected` : null,
              ]
                .filter(Boolean)
                .join(" · ")
            : undefined
        }
      >
        <Select value={city} aria-label="City" onChange={(e) => setCity(e.target.value)}>
          <option value="">All cities</option>
          {ARENA_CITIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        <Select value={sport} aria-label="Sport" onChange={(e) => setSport(e.target.value)}>
          <option value="">All sports</option>
          {sports.map((s) => (
            <option key={s} value={s}>
              {titleCase(s)}
            </option>
          ))}
        </Select>
        <Select
          value={status}
          aria-label="Status"
          onChange={(e) => setStatus(e.target.value as Status)}
        >
          <option value="">Any status</option>
          <option value="live">Live</option>
          <option value="offline">Offline</option>
          <option value="pending">Pending review</option>
          <option value="rejected">Rejected</option>
        </Select>
      </PageHeader>

      <div className="animate-fade-in">
        {isLoading && (
          <div className="ah-grid ah-g-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="ah-skeleton" style={{ height: 250 }} />
            ))}
          </div>
        )}
        {isError && (
          <section className="ah-card">
            <div className="ah-card-body">
              <div className="ah-card-error" role="alert">
                <span>Could not load the arenas.</span>
                <Button variant="outline" size="sm" onClick={refetch}>
                  Try again
                </Button>
              </div>
            </div>
          </section>
        )}
        {!isLoading && !isError && shown.length === 0 && (
          <section className="ah-card">
            <AdminEmpty>No arenas match these filters.</AdminEmpty>
          </section>
        )}
        {!isLoading && !isError && shown.length > 0 && (
          <div className="ah-grid ah-g-3">
            {shown.map((a) => (
              <ArenaCard key={a.id} arena={a} onOpen={() => setOpenId(a.id)} />
            ))}
          </div>
        )}
        {truncated && (
          <p className="ah-mute" style={{ fontSize: 12.5, marginTop: 12 }}>
            Showing the first 100 arenas of each status.
          </p>
        )}
      </div>

      <ArenaDetailDialog
        arena={opened}
        onOpenChange={(v) => !v && setOpenId(null)}
        actions={
          opened && statusOf(opened) === "pending" ? (
            <Button asChild className="ah-lime">
              <Link href="/admin/arenas">Review in Approvals</Link>
            </Button>
          ) : undefined
        }
      />
    </>
  );
}
