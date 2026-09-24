"use client";

import { useState, type FormEvent } from "react";
import { RouteShell } from "@/app/components/route-shell";
import { supabase } from "@/lib/supabaseClient";

export default function FeedbackPage() {
  const [category, setCategory] = useState<"feedback" | "problem">("feedback");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || saving || message.trim().length < 10) return;
    setSaving(true);
    setStatus("");

    const { data } = await supabase.auth.getUser();
    const userId = data.user?.id;
    const { error } = userId ? await supabase.from("beta_feedback").insert({ category, message: message.trim(), page_path: window.location.pathname, user_id: userId }) : { error: new Error("Session absente") };

    if (error) {
      setStatus("Impossible d’envoyer votre message. Réessayez dans quelques instants.");
    } else {
      setMessage("");
      setStatus("Merci. Votre message a été transmis à l’équipe Nexbail.");
    }
    setSaving(false);
  }

  return (
    <RouteShell title="Donner mon avis" description="Partagez un commentaire ou signalez un problème pendant la bêta privée.">
      <form className="mx-auto grid max-w-2xl gap-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5" onSubmit={submit}>
        <label className="grid gap-2 text-sm font-medium text-[var(--muted)]">
          Type de message
          <select className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[var(--foreground)]" value={category} onChange={(event) => setCategory(event.target.value === "problem" ? "problem" : "feedback")}>
            <option value="feedback">Commentaire</option>
            <option value="problem">Signaler un problème</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium text-[var(--muted)]">
          Message
          <textarea className="min-h-40 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[var(--foreground)] outline-none focus:border-[color:var(--accent)]" maxLength={4000} minLength={10} required value={message} onChange={(event) => setMessage(event.target.value)} />
        </label>
        {status ? <p aria-live="polite" className="text-sm text-[var(--muted)]">{status}</p> : null}
        <button className="btn-primary justify-self-start disabled:cursor-not-allowed disabled:opacity-50" disabled={saving || message.trim().length < 10} type="submit">{saving ? "Envoi…" : "Envoyer"}</button>
      </form>
    </RouteShell>
  );
}
