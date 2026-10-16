"use client";

import { useState } from "react";

import { PageHeader } from "@/components/admin/page-header";
import {
  AdminBadge,
  AdminEmpty,
  AdminTableFoot,
  AdminTag,
  statusLabel,
} from "@/components/admin/ui";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useComplaintActions, useComplaints } from "@/hooks/useAdmin";
import { formatDate, plural } from "@/lib/format";
import { ApiError } from "@/services/api";
import type { Complaint, ComplaintCategory, ComplaintStatus } from "@/types";

const CATEGORIES: ComplaintCategory[] = [
  "booking_issue",
  "payment_issue",
  "arena_quality",
  "owner_behavior",
  "technical_problem",
  "other",
];
const STATUSES: ComplaintStatus[] = ["open", "under_review", "resolved"];

/** Short ticket reference, in the same style as the booking reference (#BK-…). */
function ticketRef(id: string): string {
  return `CMP-${id.slice(0, 4).toUpperCase()}`;
}

/** The prototype's age column: hours under a day, then days. */
function age(iso: string): string {
  const hours = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000));
  return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
}

export default function AdminComplaintsPage() {
  const [status, setStatus] = useState<ComplaintStatus | "">("");
  const [category, setCategory] = useState<ComplaintCategory | "">("");
  const [page, setPage] = useState(1);
  const { data, isLoading } = useComplaints({
    status: status || undefined,
    category: category || undefined,
    page,
  });
  const { respond } = useComplaintActions();

  const [responding, setResponding] = useState<Complaint | null>(null);
  const [response, setResponse] = useState("");
  const [nextStatus, setNextStatus] = useState<ComplaintStatus>("under_review");
  const [error, setError] = useState<string | null>(null);

  const complaints = data?.items ?? [];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  function openRespond(c: Complaint) {
    setResponding(c);
    setResponse(c.admin_response ?? "");
    setNextStatus(c.status === "open" ? "under_review" : c.status);
    setError(null);
  }

  async function onRespond() {
    if (!responding) return;
    setError(null);
    try {
      await respond.mutateAsync({
        complaintId: responding.id,
        adminResponse: response.trim(),
        status: nextStatus,
      });
      setResponding(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update the complaint.");
    }
  }

  return (
    <>
      <PageHeader title="Complaints" subtitle={data ? plural(data.total, "complaint") : undefined}>
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as ComplaintStatus | "");
            setPage(1);
          }}
        >
          <option value="">Any status</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </Select>
        <Select
          value={category}
          onChange={(e) => {
            setCategory(e.target.value as ComplaintCategory | "");
            setPage(1);
          }}
        >
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {statusLabel(c)}
            </option>
          ))}
        </Select>
      </PageHeader>

      <div className="animate-fade-in">
        <section className="ah-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ticket</TableHead>
                <TableHead>Raised by</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="w-2/5">Description</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Assigned to</TableHead>
                <TableHead>Age</TableHead>
                <TableHead className="ah-r">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell className="ah-mute" colSpan={8}>
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && complaints.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="p-0">
                    <AdminEmpty>No complaints found.</AdminEmpty>
                  </TableCell>
                </TableRow>
              )}
              {complaints.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="ah-strong tabular-nums">{ticketRef(c.id)}</TableCell>
                  <TableCell>{c.player_name}</TableCell>
                  <TableCell>
                    <AdminTag>{statusLabel(c.category)}</AdminTag>
                  </TableCell>
                  <TableCell style={{ maxWidth: 280 }}>
                    <div>{c.description}</div>
                    {c.admin_response && (
                      <div className="ah-sub">
                        <span className="ah-strong">Response:</span> {c.admin_response}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <AdminBadge status={c.status} />
                  </TableCell>
                  <TableCell className="ah-t2">{c.assigned_to_name ?? "Unassigned"}</TableCell>
                  <TableCell
                    className="ah-t2 tabular-nums"
                    title={formatDate(c.created_at.slice(0, 10))}
                  >
                    {age(c.created_at)}
                  </TableCell>
                  <TableCell className="ah-r">
                    <div className="ah-row-actions">
                      <Button variant="ghost" size="sm" onClick={() => openRespond(c)}>
                        Open
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {data && data.total > 0 && (
            <AdminTableFoot
              from={(page - 1) * data.page_size + 1}
              to={Math.min(page * data.page_size, data.total)}
              total={data.total}
              page={page}
              pageCount={totalPages}
              onPage={setPage}
            />
          )}
        </section>
      </div>

      <Dialog open={!!responding} onOpenChange={(v) => !v && setResponding(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {responding ? `${ticketRef(responding.id)} · ${responding.player_name}` : ""}
            </DialogTitle>
          </DialogHeader>
          <p className="ah-t2" style={{ margin: 0, fontSize: 13 }}>
            {responding?.description}
          </p>
          <p className="ah-sub" style={{ margin: 0 }}>
            Assigned to:{" "}
            <span className="ah-strong">
              {responding?.assigned_to_name ?? "Unassigned — will assign to you on save"}
            </span>
          </p>

          <div className="ah-field">
            <Label htmlFor="complaint-status">Status</Label>
            <Select
              id="complaint-status"
              value={nextStatus}
              onChange={(e) => setNextStatus(e.target.value as ComplaintStatus)}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
            </Select>
          </div>

          <Textarea
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            placeholder="Write your response…"
            rows={4}
          />

          {error && (
            <p role="alert" className="ah-auth-error">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setResponding(null)}
              disabled={respond.isPending}
            >
              Cancel
            </Button>
            <ActionButton
              tone="positive"
              busy={respond.isPending}
              failed={!!error}
              disabled={respond.isPending || !response.trim()}
              onClick={onRespond}
            >
              Save
            </ActionButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
