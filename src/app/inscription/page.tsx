import { Suspense } from "react";
import { AuthCard } from "@/components/AuthCard";

export default function InscriptionPage() {
  return (
    <Suspense fallback={null}>
      <AuthCard mode="inscription" />
    </Suspense>
  );
}
