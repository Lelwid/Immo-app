import type { ReactNode } from "react";
import { TenantPortalShell } from "@/components/tenant-portal/TenantPortalShell";

export default function TenantPortalLayout({ children }: { children: ReactNode }) {
  return <TenantPortalShell>{children}</TenantPortalShell>;
}
