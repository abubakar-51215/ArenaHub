"use client";

import { UsersView } from "@/components/admin/users-view";

export default function AdminOwnersPage() {
  return <UsersView role="owner" title="Arena Owners" />;
}
