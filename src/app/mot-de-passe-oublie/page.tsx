import { Suspense } from "react";
import { AuthCard } from "@/components/AuthCard";

export default function MotDePasseOubliePage() {
  return (
    <Suspense fallback={null}>
      <AuthCard mode="reset" />
    </Suspense>
  );
}
