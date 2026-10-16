"use client";

import { Suspense } from "react";

import { UsersView } from "@/components/admin/users-view";

export default function AdminUsersPage() {
  // UsersView reads ?search= (set by the command palette), so it needs Suspense
  return (
    <Suspense fallback={null}>
      <UsersView
        role="player"
        title="Players"
        noun={["registered account", "registered accounts"]}
      />
    </Suspense>
  );
}
