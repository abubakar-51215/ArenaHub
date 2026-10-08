"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { ArenaActionDialog } from "@/components/admin/arena-actions";
import { ArenaDetailDialog } from "@/components/admin/arena-detail";
import { CourtArt } from "@/components/admin/court-art";
import { PageHeader } from "@/components/admin/page-header";
import { AdminBadge, AdminEmpty, AdminTag } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useAdminArena, useArenaDirectory, type ArenaAction } from "@/hooks/useAdmin";
import { ARENA_CITIES, type Arena } from "@/types";

type Status = "" | "live" | "offline" | "pending" | "suspended" | "rejected";

/** Live = approved and selling; Suspended = taken off the platform by an
 *  admin; Off = approved but switched off by the owner. Removed arenas are
 *  never listed (the API leaves them out). */
function statusOf(a: Arena): Exclude<Status, ""> {
  if (a.status === "pending") return "pending";
  if (a.status === "rejected") return "rejected";
  if (a.suspended_at) return "suspended";
  return a.is_active ? "live" : "offline";
}

const BADGE: Record<
  Exclude<Status, "">,
  { tone: "ok" | "idle" | "wait" | "off"; label: string }
> = {
  live: { tone: "ok", label: "Live" },
  offline: { tone: "idle", label: "Off" },
  pending: { tone: "wait", label: "Pending review" },
  suspended: { tone: "off", label: "Suspended" },
  rejected: { tone: "off", label: "Rejected" },
};

function titleCase(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function ArenaCard({
  arena,
  onOpen,
  onAction,
}: {
  arena: Arena;
  onOpen: () => void;
  onAction: (action: ArenaAction) => void;
}) {
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
          {/* only the actions valid for this arena */}
          {arena.status === "approved" && !arena.suspended_at && (
            <Button variant="outline" size="sm" onClick={() => onAction("suspend")}>
              Suspend
            </Button>
          )}
          {arena.suspended_at && (
            <Button variant="outline" size="sm" onClick={() => onAction("reactivate")}>
              Reactivate
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="ah-danger-text"
            onClick={() => onAction("remove")}
          >
            Remove
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
  const { arenas, suspended, totals, isLoading, isError, refetch, truncated } = useArenaDirectory();
  const [city, setCity] = useState("");
  const [sport, setSport] = useState("");
  const [status, setStatus] = useState<Status>("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [acting, setActing] = useState<{ action: ArenaAction; arena: Arena } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // the success line goes away on its own
  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(t);
  }, [notice]);
  const detail = useAdminArena(openId);
  // the fresh record from GET /admin/arenas/{id}, or the list's copy while it loads
  const opened = openId ? (detail.data ?? arenas.find((a) => a.id === openId) ?? null) : null;

  const sports = [...new Set(arenas.flatMap((a) => a.sports_offered))].sort();
  // "Suspended" lists the suspended=true query; the other statuses filter the directory
  const shown = (status === "suspended" ? suspended : arenas).filter(
    (a) =>
      (!city || a.city === city) &&
      (!sport || a.sports_offered.includes(sport)) &&
      (!status || statusOf(a) === status),
  );
  const live = arenas.filter((a) => statusOf(a) === "live").length;

  return (
    <>
      <PageHeader
        title="Arenas"
        subtitle={
          totals
            ? [
                `${live.toLocaleString("en-US")} live`,
                `${totals.pending.toLocaleString("en-US")} pending`,
                `${totals.suspended.toLocaleString("en-US")} suspended`,
              ].join(" · ")
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
          <option value="offline">Off</option>
          <option value="pending">Pending review</option>
          <option value="suspended">Suspended</option>
          <option value="rejected">Rejected</option>
        </Select>
      </PageHeader>

      <div className="animate-fade-in">
        {notice && (
          <p className="ah-saved ah-notice" role="status">
            {notice}
          </p>
        )}
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
              <ArenaCard
                key={a.id}
                arena={a}
                onOpen={() => setOpenId(a.id)}
                onAction={(action) => setActing({ action, arena: a })}
              />
            ))}
          </div>
        )}
        {truncated && (
          <p className="ah-mute" style={{ fontSize: 12.5, marginTop: 12 }}>
            Showing the first 100 arenas of each status.
          </p>
        )}
      </div>

      <ArenaActionDialog target={acting} onClose={() => setActing(null)} onDone={setNotice} />

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
