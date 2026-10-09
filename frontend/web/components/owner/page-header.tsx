"use client";

import { Suspense } from "react";
import { usePathname } from "next/navigation";

import { PageHeader as ConsolePageHeader } from "@/components/admin/page-header";
import { ArenaPicker } from "@/components/owner/topbar";
import { ARENA_PICKER_ROUTES } from "@/hooks/useArenaParam";

/**
 * The arena filter in a page's own header row, at 1024px and wider, on the
 * pages whose data really filters by arena. The Live Board has the top bar
 * (with the same picker) instead; below 1024px the picker sits in the row
 * under the slim bar.
 */
function HeaderPicker() {
  const pathname = usePathname();
  if (pathname === "/owner" || !ARENA_PICKER_ROUTES.includes(pathname)) return null;
  return (
    <div className="ah-hdr-picker">
      <Suspense fallback={null}>
        <ArenaPicker />
      </Suspense>
    </div>
  );
}

/**
 * Owner page heading, styled as the owner prototype's `.page-head` (the
 * same block as the admin one): an Archivo title with a muted sub-line, and
 * the page's own filters and buttons on the right. It sits on the page; only
 * the Live Board has a top bar above it.
 */
export function PageHeader({
  title,
  subtitle,
  eyebrow,
  children,
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="ah-ohead">
      <ConsolePageHeader title={title} subtitle={subtitle} eyebrow={eyebrow}>
        <HeaderPicker />
        {children}
      </ConsolePageHeader>
    </div>
  );
}
