"use client";

import { useSyncExternalStore, type ReactNode } from "react";

export function ClientOnly({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  const mounted = useSyncExternalStore(subscribeMounted, getMountedSnapshot, getServerSnapshot);

  if (!mounted) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

function subscribeMounted(onStoreChange: () => void) {
  const timer = window.setTimeout(onStoreChange, 0);
  return () => window.clearTimeout(timer);
}

function getMountedSnapshot() {
  return true;
}

function getServerSnapshot() {
  return false;
}
