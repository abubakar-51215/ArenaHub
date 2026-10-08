import { PageHeader as ConsolePageHeader } from "@/components/admin/page-header";

/**
 * Owner page heading, styled as the owner prototype's `.page-head` (the
 * same block as the admin one): an Archivo title with a muted sub-line, and
 * the page's own filters and buttons on the right. It sits on the page, not
 * in a bar of its own; the top bar above it is the shell's.
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
        {children}
      </ConsolePageHeader>
    </div>
  );
}
