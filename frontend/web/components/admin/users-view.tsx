"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { PageHeader } from "@/components/admin/page-header";
import { AdminBadge, AdminEmpty, AdminPerson, AdminTableFoot, AdminTag } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useUserActions, useUsers } from "@/hooks/useAdmin";
import { formatDate } from "@/lib/format";
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
  /** when set, the sub-line is the live total plus this noun, e.g. "registered accounts" */
  noun?: string;
}) {
  // the command palette opens a person's row as /admin/users?search=<email>
  const [page, setPage] = useState(1);
  const urlSearch = useSearchParams().get("search") ?? "";
  const [search, setSearch] = useState(urlSearch);
  useEffect(() => {
    setSearch(urlSearch);
    setPage(1);
  }, [urlSearch]);
  const { data, isLoading } = useUsers({ role, search: search || undefined, page });
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
        subtitle={noun ? (data ? `${data.total.toLocaleString("en-US")} ${noun}` : undefined) : subtitle}
      >
        <Input
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="ah-search"
        />
      </PageHeader>
      <div className="animate-fade-in">
        <section className="ah-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="ah-r">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell className="ah-mute" colSpan={6}>
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && users.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="p-0">
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
                    <div className="ah-sub tabular-nums">{u.phone}</div>
                  </TableCell>
                  <TableCell>
                    <AdminTag>{u.role.charAt(0).toUpperCase() + u.role.slice(1)}</AdminTag>
                  </TableCell>
                  <TableCell>
                    <AdminBadge status={u.is_active ? "active" : "suspended"} />
                  </TableCell>
                  <TableCell className="ah-t2 tabular-nums">
                    {formatDate(u.created_at.slice(0, 10))}
                  </TableCell>
                  <TableCell className="ah-r">
                    <div className="ah-row-actions">
                      {u.is_active ? (
                        <Button variant="ghost" size="sm" onClick={() => setSuspending(u)}>
                          Suspend
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={reactivate.isPending}
                          onClick={() => reactivate.mutate(u.id)}
                        >
                          Reinstate
                        </Button>
                      )}
                      {u.role !== "admin" && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => {
                            setDeleting(u);
                            setDeleteError(null);
                          }}
                        >
                          Delete
                        </Button>
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
            <DialogTitle>Suspend {suspending?.full_name}</DialogTitle>
          </DialogHeader>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for suspension…"
            rows={3}
            autoFocus
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSuspending(null)}
              disabled={suspend.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
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
              {suspend.isPending ? "Suspending…" : "Suspend"}
            </Button>
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
            <DialogTitle>Delete {deleting?.full_name}?</DialogTitle>
          </DialogHeader>
          <p className="ah-mute" style={{ margin: 0, fontSize: 13 }}>
            This removes the account from the active user list and permanently blocks it from
            logging in. Their bookings, payments, and reviews are kept for record-keeping, but
            personal details are scrubbed. This cannot be undone.
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
            <Button
              variant="destructive"
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
              {remove.isPending ? "Deleting…" : "Delete User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
