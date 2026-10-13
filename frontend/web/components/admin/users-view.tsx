"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { PageHeader } from "@/components/admin/page-header";
import {
  AdminBadge,
  AdminEmpty,
  AdminPerson,
  AdminTableFoot,
  AdminTag,
} from "@/components/admin/ui";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
import { useUserActions, useUserDetail, useUsers } from "@/hooks/useAdmin";
import { formatDate, plural } from "@/lib/format";
import { ApiError } from "@/services/api";
import type { AdminUser, UserRole } from "@/types";

export function UsersView({
  role,
  title,
  subtitle,
  noun,
}: {
  role?: UserRole;
  title: string;
  subtitle?: string;
  /** when set, the sub-line is the live total plus this noun, singular and
   *  plural, e.g. ["registered account", "registered accounts"] */
  noun?: [string, string];
}) {
  // the command palette opens a person's row as /admin/users?search=<email>
  const [page, setPage] = useState(1);
  const urlSearch = useSearchParams().get("search") ?? "";
  const [search, setSearch] = useState(urlSearch);
  useEffect(() => {
    setSearch(urlSearch);
    setPage(1);
  }, [urlSearch]);
  const [status, setStatus] = useState<"" | "active" | "suspended">("");
  const { data, isLoading } = useUsers({
    role,
    search: search || undefined,
    is_active: status === "" ? undefined : status === "active",
    page,
  });
  // "owner account" on the owners screen, "player account" on players
  const account =
    role === "owner" ? "owner account" : role === "player" ? "player account" : "account";
  const [viewing, setViewing] = useState<AdminUser | null>(null);
  const detail = useUserDetail(viewing?.id ?? null);
  const { suspend, reactivate, remove } = useUserActions();

  const [suspending, setSuspending] = useState<AdminUser | null>(null);
  const [reason, setReason] = useState("");
  const [deleting, setDeleting] = useState<AdminUser | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const users = data?.items ?? [];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <>
      <PageHeader
        title={title}
        subtitle={
          noun ? (data ? plural(data.total, noun[0], noun[1]) : undefined) : subtitle
        }
      >
        <Input
          placeholder="Search name or email"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="ah-search"
          aria-label="Search"
        />
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as "" | "active" | "suspended");
            setPage(1);
          }}
          aria-label="Status"
        >
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </Select>
      </PageHeader>
      <div className="animate-fade-in">
        <section className="ah-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Contact</TableHead>
                {/* the prototype's owner table has no role column: every row is an owner */}
                {role !== "owner" && <TableHead>Role</TableHead>}
                <TableHead>Status</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="ah-r">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell className="ah-mute" colSpan={role === "owner" ? 5 : 6}>
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && users.length === 0 && (
                <TableRow>
                  <TableCell colSpan={role === "owner" ? 5 : 6} className="p-0">
                    <AdminEmpty>No users found.</AdminEmpty>
                  </TableCell>
                </TableRow>
              )}
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <AdminPerson name={u.full_name} />
                  </TableCell>
                  <TableCell>
                    <div className="ah-t2">{u.email}</div>
                    {/* the prototype lists the phone under the email for owners only */}
                    {role !== "player" && <div className="ah-sub tabular-nums">{u.phone}</div>}
                  </TableCell>
                  {role !== "owner" && (
                    <TableCell>
                      <AdminTag>{u.role.charAt(0).toUpperCase() + u.role.slice(1)}</AdminTag>
                    </TableCell>
                  )}
                  <TableCell>
                    <AdminBadge status={u.is_active ? "active" : "suspended"} />
                  </TableCell>
                  <TableCell className="ah-t2 tabular-nums">
                    {formatDate(u.created_at.slice(0, 10))}
                  </TableCell>
                  <TableCell className="ah-r">
                    <div className="ah-row-actions">
                      <Button variant="ghost" size="sm" onClick={() => setViewing(u)}>
                        View
                      </Button>
                      {u.is_active ? (
                        <ActionButton
                          tone="negative"
                          variant="ghost"
                          size="sm"
                          onClick={() => setSuspending(u)}
                        >
                          Suspend
                        </ActionButton>
                      ) : (
                        <ActionButton
                          tone="positive"
                          variant="ghost"
                          size="sm"
                          disabled={reactivate.isPending}
                          busy={reactivate.isPending && reactivate.variables === u.id}
                          failed={reactivate.isError}
                          onClick={() => reactivate.mutate(u.id)}
                        >
                          Reinstate
                        </ActionButton>
                      )}
                      {u.role !== "admin" && (
                        <ActionButton
                          tone="negative"
                          variant="destructive"
                          size="sm"
                          onClick={() => {
                            setDeleting(u);
                            setDeleteError(null);
                          }}
                        >
                          Delete
                        </ActionButton>
                      )}
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

      <Dialog
        open={!!suspending}
        onOpenChange={(v) => {
          if (!v) {
            setSuspending(null);
            setReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Suspend {account}</DialogTitle>
            <DialogDescription>
              {suspending?.full_name} will be signed out and cannot sign in until the {account} is
              reinstated. They are told the reason.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for suspension…"
            rows={3}
            maxLength={500}
            autoFocus
          />
          <div className="ah-reason-hint">
            <span />
            <span className="tabular-nums" aria-live="polite">
              {reason.length} / 500
            </span>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSuspending(null)}
              disabled={suspend.isPending}
            >
              Cancel
            </Button>
            <ActionButton
              tone="negative"
              variant="destructive"
              busy={suspend.isPending}
              failed={suspend.isError}
              disabled={suspend.isPending || !reason.trim()}
              onClick={() => {
                if (!suspending) return;
                suspend.mutate(
                  { userId: suspending.id, reason: reason.trim() },
                  {
                    onSuccess: () => {
                      setSuspending(null);
                      setReason("");
                    },
                  },
                );
              }}
            >
              {`Suspend ${account}`}
            </ActionButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!deleting}
        onOpenChange={(v) => {
          if (!v) {
            setDeleting(null);
            setDeleteError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {account}?</DialogTitle>
          </DialogHeader>
          <p className="ah-mute" style={{ margin: 0, fontSize: 13 }}>
            {deleting?.full_name}: this removes the {account} from the active list and permanently
            blocks it from logging in. Their bookings, payments, and reviews are kept for
            record-keeping, but personal details are scrubbed. This cannot be undone.
          </p>
          {deleteError && (
            <p role="alert" className="ah-auth-error">
              {deleteError}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)} disabled={remove.isPending}>
              Cancel
            </Button>
            <ActionButton
              tone="negative"
              variant="destructive"
              busy={remove.isPending}
              failed={!!deleteError}
              disabled={remove.isPending}
              onClick={() => {
                if (!deleting) return;
                setDeleteError(null);
                remove.mutate(deleting.id, {
                  onSuccess: () => setDeleting(null),
                  onError: (err) =>
                    setDeleteError(
                      err instanceof ApiError ? err.message : "Could not delete the user.",
                    ),
                });
              }}
            >
              {`Delete ${account}`}
            </ActionButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!viewing} onOpenChange={(v) => !v && setViewing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{viewing?.full_name}</DialogTitle>
            <DialogDescription>
              {viewing
                ? `${viewing.role.charAt(0).toUpperCase()}${viewing.role.slice(1)} account`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {viewing && (
            <dl className="ah-detail">
              <dt>Email</dt>
              <dd>{viewing.email}</dd>
              <dt>Phone</dt>
              <dd className="tabular-nums">{viewing.phone}</dd>
              <dt>Status</dt>
              <dd>
                <AdminBadge status={viewing.is_active ? "active" : "suspended"} />
              </dd>
              <dt>Email verified</dt>
              <dd>{viewing.is_verified ? "Yes" : "No"}</dd>
              <dt>Joined</dt>
              <dd className="tabular-nums">{formatDate(viewing.created_at.slice(0, 10))}</dd>
              <dt>Bookings</dt>
              <dd className="tabular-nums">
                {detail.isLoading
                  ? "…"
                  : detail.isError
                    ? "Could not load"
                    : (detail.data?.total_bookings ?? 0).toLocaleString("en-US")}
              </dd>
            </dl>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewing(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
