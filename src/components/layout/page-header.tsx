import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title       : string;
  description?: string;
  children?   : React.ReactNode;
  className?  : string;
  breadcrumbs?: { label: string; href?: string }[];
}

export function PageHeader({
  title,
  description,
  children,
  className,
  breadcrumbs
}: PageHeaderProps) {
  return (
    <div className={cn("mb-8", className)}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="mb-4 text-sm text-muted-foreground">
          {breadcrumbs.map((crumb, i) => (
            <span key={i}>
              {crumb.href ? (
                <a href={crumb.href} className="hover:text-foreground transition-colors">
                  {crumb.label}
                </a>
              ) : (
                <span className="text-foreground">{crumb.label}</span>
              )}
              {i < breadcrumbs.length - 1 && (
                <span className="mx-2">/</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
          {description && (
            <p className="mt-2 text-muted-foreground max-w-2xl">{description}</p>
          )}
        </div>
        {children && (
          <div className="flex items-center gap-2 shrink-0">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}

interface PageContainerProps {
  children  : React.ReactNode;
  className?: string;
  fullWidth?: boolean;
}

export function PageContainer({ children, className, fullWidth }: PageContainerProps) {
  return (
    <div className={cn(
      "mx-auto px-6 py-8",
      !fullWidth && "max-w-[1440px]",
      className
    )}>
      {children}
    </div>
  );
}

interface PageSectionProps {
  title?      : string;
  description?: string;
  children    : React.ReactNode;
  className?  : string;
  action?     : React.ReactNode;
}

export function PageSection({
  title,
  description,
  children,
  className,
  action
}: PageSectionProps) {
  return (
    <section className={cn("mb-8", className)}>
      {(title || action) && (
        <div className="flex items-center justify-between mb-4">
          <div>
            {title && (
              <h2 className="text-lg font-medium">{title}</h2>
            )}
            {description && (
              <p className="text-sm text-muted-foreground mt-1">{description}</p>
            )}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
