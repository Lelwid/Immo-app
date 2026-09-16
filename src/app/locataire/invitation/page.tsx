"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { TenantCard, TenantPortalPageHeader } from "@/components/tenant-portal/TenantPortalContent";
import { acceptTenantPortalInvitation } from "@/lib/data/tenantPortalService";

export default function TenantPortalInvitationPage() {
  return (
    <Suspense fallback={<InvitationShell message="Préparation de l'invitation..." />}>
      <InvitationContent />
    </Suspense>
  );
}

function InvitationContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const acceptedRef = useRef(false);
  const [message, setMessage] = useState("Validation de l'invitation...");
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");

  useEffect(() => {
    if (acceptedRef.current) {
      return;
    }

    acceptedRef.current = true;

    async function acceptInvitation() {
      if (!token) {
        setStatus("error");
        setMessage("Lien d'invitation invalide.");
        return;
      }

      try {
        await acceptTenantPortalInvitation(token);
        setStatus("success");
        setMessage("Votre accès locataire est activé.");
      } catch (error) {
        console.error("Impossible d'activer l'invitation locataire.", error);
        setStatus("error");
        setMessage("Impossible d'activer cette invitation.");
      }
    }

    void acceptInvitation();
  }, [token]);

  return <InvitationShell message={message} status={status} />;
}

function InvitationShell({ message, status = "loading" }: { message: string; status?: "loading" | "success" | "error" }) {
  return (
    <TenantPortalPageHeader title="Invitation" description="Activation de votre accès au portail locataire.">
      <TenantCard>
        <p className={`font-semibold ${status === "error" ? "text-[color:var(--red)]" : "text-[var(--foreground)]"}`}>{message}</p>
        {status === "success" ? (
          <Link className="btn-primary mt-4 inline-flex" href="/locataire">
            Ouvrir mon portail
          </Link>
        ) : null}
        {status === "error" ? (
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Vérifiez que vous êtes connecté avec le même courriel que celui utilisé pour l’invitation.</p>
        ) : null}
      </TenantCard>
    </TenantPortalPageHeader>
  );
}
