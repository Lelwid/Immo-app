"use client";

import { AppHeader } from "@/components/AppHeader";

type RouteShellProps = {
  title: string;
  description: string;
  children: React.ReactNode;
  action?: React.ReactNode;
};

export function RouteShell({ action, title, description, children }: RouteShellProps) {
  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
        <AppHeader />
        <header className="border-b border-[var(--border)] pb-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium text-[var(--muted)]">Gestionnaire Immo</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-normal text-[var(--foreground)] sm:text-[2.5rem]">
                {title}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">{description}</p>
            </div>
            {action ? <div className="shrink-0 sm:pb-1">{action}</div> : null}
          </div>
        </header>
        {children}
      </div>
    </main>
  );
}
