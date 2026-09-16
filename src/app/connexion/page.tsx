import { Suspense } from "react";
import { AuthCard } from "@/components/AuthCard";

export default function ConnexionPage() {
  return (
    <Suspense fallback={null}>
      <AuthCard mode="connexion" />
    </Suspense>
  );
}
