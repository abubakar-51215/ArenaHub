"use client";

import { Suspense } from "react";

import { UsersView } from "@/components/admin/users-view";

export default function AdminOwnersPage() {
  // UsersView reads ?search= (set by the command palette), so it needs Suspense
  return (
    <Suspense fallback={null}>
      <UsersView role="owner" title="Arena owners" noun={["owner", "owners"]} />
    </Suspense>
  );
}
