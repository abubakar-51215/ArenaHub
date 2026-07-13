"use client";

import Link from "next/link";
import { useState } from "react";
import { Pencil, Plus, PowerOff, RotateCcw } from "lucide-react";

import { ArenaForm } from "@/components/owner/arena-form";
import { PageHeader } from "@/components/owner/page-header";
import { StatusBadge } from "@/components/owner/status-badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDeactivateArena, useMyArenas, useResubmitArena } from "@/hooks/useArenas";
import type { Arena } from "@/types";

export default function ArenasPage() {
  const { data, isLoading } = useMyArenas();
  const deactivate = useDeactivateArena();
  const resubmit = useResubmitArena();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Arena | undefined>(undefined);

  const arenas = data?.items ?? [];

  function openCreate() {
    setEditing(undefined);
    setFormOpen(true);
  }
  function openEdit(a: Arena) {
    setEditing(a);
    setFormOpen(true);
  }

  return (
    <>
      <PageHeader title="Manage Arenas">
        <Button onClick={openCreate} className="bg-blue-600 text-white hover:bg-blue-700">
          <Plus className="size-4" /> Add Arena
        </Button>
      </PageHeader>

      <div className="p-8">
        <div className="rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Arena Name</TableHead>
                <TableHead>City</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Courts</TableHead>
                <TableHead>Status</TableHead>
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
              {!isLoading && arenas.length === 0 && (
                <TableRow>
                  <TableCell className="text-muted-foreground" colSpan={6}>
                    No arenas yet. Click “Add Arena” to register your first one.
                  </TableCell>
                </TableRow>
              )}
              {arenas.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <p className="font-medium text-foreground">{a.name}</p>
                    {a.status === "rejected" && a.rejection_reason && (
                      <p className="text-xs text-destructive">Rejected: {a.rejection_reason}</p>
                    )}
                    {!a.is_active && (
                      <p className="text-xs text-muted-foreground">Inactive (hidden from search)</p>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{a.city}</TableCell>
                  <TableCell className="text-muted-foreground">{a.area ?? a.address}</TableCell>
                  <TableCell>
                    <Link
                      href={`/owner/courts?arena=${a.id}`}
                      className="text-sm font-medium text-blue-600 hover:underline"
                    >
                      Manage
                    </Link>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={!a.is_active ? "inactive" : a.status} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => openEdit(a)}
                        title="Edit"
                      >
                        <Pencil className="size-4" />
                      </Button>
                      {a.status === "rejected" && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Resubmit for verification"
                          disabled={resubmit.isPending}
                          onClick={() => resubmit.mutate(a.id)}
                        >
                          <RotateCcw className="size-4" />
                        </Button>
                      )}
                      {a.is_active && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Deactivate"
                          disabled={deactivate.isPending}
                          onClick={() => {
                            if (confirm(`Deactivate “${a.name}”? It will be hidden from search.`))
                              deactivate.mutate(a.id);
                          }}
                        >
                          <PowerOff className="size-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {formOpen && (
        <ArenaForm
          key={editing?.id ?? "new"}
          open={formOpen}
          onOpenChange={setFormOpen}
          arena={editing}
        />
      )}
    </>
  );
}
