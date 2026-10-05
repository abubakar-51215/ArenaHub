/**
 * Admin page heading, styled as the prototype's `.page-head`: an Archivo
 * title with a muted sub-line on the left and the page's own filters and
 * buttons on the right. It sits inside the admin canvas (no bar of its own).
 */
export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="ah-page-head">
      <div>
        <h1 className="ah-h1">{title}</h1>
        {subtitle && <p className="ah-page-sub">{subtitle}</p>}
      </div>
      {children && <div className="ah-page-actions">{children}</div>}
    </div>
  );
}
