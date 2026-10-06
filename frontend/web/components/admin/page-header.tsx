/**
 * Admin page heading, styled as the prototype's `.page-head`: an Archivo
 * title with a muted sub-line on the left and the page's own filters and
 * buttons on the right. It sits inside the admin canvas (no bar of its own).
 */
export function PageHeader({
  title,
  subtitle,
  eyebrow,
  children,
}: {
  title: string;
  subtitle?: string;
  /** small uppercase line above the title (prototype overview) */
  eyebrow?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="ah-page-head">
      <div>
        {eyebrow && <p className="ah-eyebrow">{eyebrow}</p>}
        <h1 className="ah-h1" style={eyebrow ? { marginTop: 5 } : undefined}>
          {title}
        </h1>
        {subtitle && <p className="ah-page-sub">{subtitle}</p>}
      </div>
      {children && <div className="ah-page-actions">{children}</div>}
    </div>
  );
}
