"use client";

import { useState } from "react";

import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/owner/status-badge";
import { Button } from "@/components/ui/button";
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
import { formatDate } from "@/lib/format";
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
      <PageHeader title="Complaints">
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as ComplaintStatus | "");
            setPage(1);
          }}
          className="w-36"
        >
          <option value="">All Status</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </Select>
        <Select
          value={category}
          onChange={(e) => {
            setCategory(e.target.value as ComplaintCategory | "");
            setPage(1);
          }}
          className="w-40"
        >
          <option value="">All Categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c.replace(/_/g, " ")}
            </option>
          ))}
        </Select>
      </PageHeader>

      <div className="space-y-4 p-8">
        <div className="rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Player</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="w-2/5">Description</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created On</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell className="text-muted-foreground" colSpan={6}>
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && complaints.length === 0 && (
                <TableRow>
                  <TableCell className="text-muted-foreground" colSpan={6}>
                    No complaints found.
                  </TableCell>
                </TableRow>
              )}
              {complaints.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium text-foreground">{c.player_name}</TableCell>
                  <TableCell className="text-muted-foreground capitalize">
                    {c.category.replace(/_/g, " ")}
                  </TableCell>
                  <TableCell>
                    <p className="text-sm text-foreground">{c.description}</p>
                    {c.admin_response && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        <span className="font-medium">Response:</span> {c.admin_response}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={c.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(c.created_at.slice(0, 10))}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      <Button variant="ghost" size="sm" onClick={() => openRespond(c)}>
                        {c.status === "resolved" ? "View" : "Respond"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {data && data.total > 0 && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Showing {(page - 1) * data.page_size + 1}–
              {Math.min(page * data.page_size, data.total)} of {data.total}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      <Dialog open={!!responding} onOpenChange={(v) => !v && setResponding(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complaint from {responding?.player_name}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{responding?.description}</p>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Status</label>
            <Select
              value={nextStatus}
              onChange={(e) => setNextStatus(e.target.value as ComplaintStatus)}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, " ")}
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
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
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
            <Button
              className="bg-blue-600 text-white hover:bg-blue-700"
              disabled={respond.isPending || !response.trim()}
              onClick={onRespond}
            >
              {respond.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
