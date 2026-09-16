"use client";

import { useState } from "react";
import {
  EmptyTenantState,
  formatDate,
  priorityLabel,
  statusTone,
  TenantCard,
  TenantPortalContent,
  TenantStatusBadge,
  ticketStatusLabel,
} from "@/components/tenant-portal/TenantPortalContent";
import { createTenantMaintenanceRequest, type TenantMaintenanceCategory } from "@/lib/data/tenantPortalService";
import { maintenanceImageAccept, validateMaintenanceImages } from "@/lib/fileValidation";

const categories: { label: string; value: TenantMaintenanceCategory }[] = [
  { label: "Plomberie", value: "plomberie" },
  { label: "Électricité", value: "electricite" },
  { label: "Chauffage", value: "chauffage" },
  { label: "Électroménager", value: "electromenager" },
  { label: "Serrure / porte", value: "serrure" },
  { label: "Autre", value: "autre" },
];

export default function TenantPortalEntretienPage() {
  const [category, setCategory] = useState<TenantMaintenanceCategory>("plomberie");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [title, setTitle] = useState("");

  return (
    <TenantPortalContent title="Entretien" description="Envoyez une demande d'entretien et suivez son avancement.">
      {(snapshot, _context, refresh) => {
        async function submitRequest() {
          if (!title.trim() || !description.trim()) {
            setMessage("Ajoutez un titre et une description.");
            return;
          }

          const validationError = validateMaintenanceImages(files);

          if (validationError) {
            setMessage(validationError);
            return;
          }

          setSubmitting(true);
          setMessage("");

          try {
            await createTenantMaintenanceRequest({ category, description, title }, files);
            await refresh();
            setTitle("");
            setDescription("");
            setFiles([]);
            setMessage("Votre demande a été envoyée.");
          } catch (error) {
            console.error("Impossible d'envoyer la demande d'entretien.", error);
            setMessage("Impossible d'envoyer la demande d'entretien.");
          } finally {
            setSubmitting(false);
          }
        }

        return (
          <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
            <TenantCard>
              <h2 className="text-lg font-semibold">Nouvelle demande</h2>
              <div className="mt-4 grid gap-3">
                <label className="grid gap-1 text-sm font-medium text-[var(--muted)]">
                  Sujet
                  <input
                    className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[var(--foreground)] outline-none focus:border-[color:var(--accent)]"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                  />
                </label>
                <label className="grid gap-1 text-sm font-medium text-[var(--muted)]">
                  Catégorie
                  <select
                    className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[var(--foreground)] outline-none focus:border-[color:var(--accent)]"
                    value={category}
                    onChange={(event) => setCategory(event.target.value as TenantMaintenanceCategory)}
                  >
                    {categories.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-sm font-medium text-[var(--muted)]">
                  Description
                  <textarea
                    className="min-h-32 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[var(--foreground)] outline-none focus:border-[color:var(--accent)]"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </label>
                <label className="grid gap-1 text-sm font-medium text-[var(--muted)]">
                  Photos optionnelles
                  <input
                    accept={maintenanceImageAccept}
                    className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--foreground)]"
                    multiple
                    type="file"
                    onChange={(event) => {
                      const nextFiles = Array.from(event.target.files ?? []);
                      setFiles(nextFiles);
                      setMessage(validateMaintenanceImages(nextFiles) ?? "");
                    }}
                  />
                </label>
              </div>
              {message ? <p className="mt-4 rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3 text-sm text-[var(--muted)]">{message}</p> : null}
              <button className="btn-primary mt-5 w-full disabled:cursor-not-allowed disabled:opacity-50" disabled={submitting} onClick={submitRequest} type="button">
                {submitting ? "Envoi..." : "Envoyer la demande"}
              </button>
            </TenantCard>

            <TenantCard>
              <h2 className="text-lg font-semibold">Mes demandes</h2>
              <div className="mt-4 grid gap-3">
                {snapshot.maintenanceRequests.length === 0 ? <EmptyTenantState text="Aucune demande d'entretien pour ce logement." /> : null}
                {snapshot.maintenanceRequests.map((ticket) => (
                  <article key={ticket.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-semibold">{ticket.title}</p>
                        <p className="mt-1 text-sm text-[var(--muted)]">{ticket.description}</p>
                        <p className="mt-2 text-xs text-[var(--muted)]">Créée le {formatDate(ticket.createdAt)}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <TenantStatusBadge tone={statusTone(ticket.priority)}>{priorityLabel(ticket.priority)}</TenantStatusBadge>
                        <TenantStatusBadge tone={statusTone(ticket.status)}>{ticketStatusLabel(ticket.status)}</TenantStatusBadge>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </TenantCard>
          </div>
        );
      }}
    </TenantPortalContent>
  );
}
