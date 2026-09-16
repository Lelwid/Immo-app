"use client";

type RouteShellProps = {
  title: string;
  description: string;
  children: React.ReactNode;
  action?: React.ReactNode;
};

export function RouteShell({ action, title, description, children }: RouteShellProps) {
  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-normal text-[var(--foreground)]">{title}</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--muted)]">{description}</p>
        </div>
        {action ? <div className="shrink-0 sm:pb-1">{action}</div> : null}
      </header>
      {children}
    </div>
  );
}
