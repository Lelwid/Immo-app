"use client";

import { useMemo, useState } from "react";
import { createActivityRecord } from "@/lib/data/activitiesService";
import { addActivityToStore } from "@/lib/data/activityStore";
import { createNote, deleteNote as deleteNoteRecord, updateNote } from "@/lib/data/notesService";
import type { AppNote, NoteTargetType } from "@/lib/types";
import { useLocalStore } from "@/lib/useLocalStore";

type NotesPanelProps = {
  targetType: NoteTargetType;
  targetId: string;
  propertyId: string;
  unitId?: string;
  tenantId?: string | null;
  title?: string;
  collapsedComposer?: boolean;
  compact?: boolean;
  onChanged?: () => void;
  notesSource?: AppNote[];
};

export function NotesPanel({
  collapsedComposer = false,
  compact = false,
  propertyId,
  targetId,
  targetType,
  tenantId,
  title = "Notes",
  unitId,
  onChanged,
  notesSource,
}: NotesPanelProps) {
  const { store, setStore } = useLocalStore();
  const [draft, setDraft] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(!collapsedComposer);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [noteToDelete, setNoteToDelete] = useState<AppNote | null>(null);
  const notes = useMemo(
    () =>
      (notesSource ?? store.notes)
        .filter((note) => note.targetType === targetType && note.targetId === targetId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [notesSource, store.notes, targetId, targetType],
  );
  const editingNote = notes.find((note) => note.id === editingNoteId) ?? null;

  async function saveNote() {
    const content = draft.trim();

    if (!content) {
      return;
    }

    setIsSaving(true);
    setErrorMessage("");

    try {
      const savedNote = editingNote
        ? await updateNote(editingNote.id, { content })
        : await createNote({
            targetType,
            targetId,
            propertyId,
            unitId,
            tenantId: tenantId ?? null,
            content,
          });
      setStore((current) => ({
        ...current,
        notes: editingNote
          ? current.notes.map((note) => (note.id === savedNote.id ? savedNote : note))
          : [savedNote, ...current.notes],
      }));

      try {
        const activity = await createActivityRecord({
          propertyId,
          unitId,
          tenantId,
          type: "note",
          title: editingNote ? "Note modifiée" : "Note ajoutée",
          description: `Une note a été ${editingNote ? "modifiée" : "ajoutée"} dans ${title.toLowerCase()}.`,
        });

        setStore((current) => addActivityToStore(current, activity));
      } catch (error) {
        console.error("Impossible de créer l'activité de note.", error);
      }

      setDraft("");
      setEditingNoteId(null);
      if (collapsedComposer) {
        setComposerOpen(false);
      }
      onChanged?.();
    } catch {
      setErrorMessage(editingNote ? "Impossible de modifier la note." : "Impossible de créer la note.");
    } finally {
      setIsSaving(false);
    }
  }

  function startEdit(note: AppNote) {
    setEditingNoteId(note.id);
    setDraft(note.content);
    setComposerOpen(true);
  }

  function cancelEdit() {
    setEditingNoteId(null);
    setDraft("");
    if (collapsedComposer) {
      setComposerOpen(false);
    }
  }

  async function deleteNote(note: AppNote) {
    setIsSaving(true);
    setErrorMessage("");

    try {
      await deleteNoteRecord(note.id);
      setStore((current) => ({
        ...current,
        notes: current.notes.filter((candidate) => candidate.id !== note.id),
      }));

      try {
        const activity = await createActivityRecord({
          propertyId: note.propertyId,
          unitId: note.unitId,
          tenantId: note.tenantId,
          type: "note",
          title: "Note supprimée",
          description: `Une note a été supprimée dans ${title.toLowerCase()}.`,
        });

        setStore((current) => addActivityToStore(current, activity));
      } catch (error) {
        console.error("Impossible de créer l'activité de note.", error);
      }
      setNoteToDelete(null);
      if (editingNoteId === note.id) {
        cancelEdit();
      }
      onChanged?.();
    } catch {
      setErrorMessage("Impossible de supprimer la note.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="grid gap-4">
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-[var(--foreground)]">{title}</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">Notes libres sauvegardées.</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="rounded-full border border-[var(--border)] bg-[var(--surface-3)] px-3 py-1 text-xs font-semibold text-[var(--muted)]">
              {notes.length}
            </span>
            {collapsedComposer && !composerOpen ? (
              <button className="btn-secondary" onClick={() => setComposerOpen(true)} type="button">
                + Ajouter une note
              </button>
            ) : null}
          </div>
        </div>
        {composerOpen ? (
          <>
            {errorMessage ? (
              <div className="mt-4 rounded-lg border border-[color:var(--red)]/35 bg-[color:var(--red)]/10 px-3 py-2 text-sm font-semibold text-[color:var(--red)]">
                {errorMessage}
              </div>
            ) : null}
            <label className="mt-4 grid gap-2 text-sm font-medium text-[var(--muted)]">
              {editingNote ? "Modifier la note" : "Nouvelle note"}
              <textarea
                className="min-h-28 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm leading-6 text-[var(--foreground)] outline-none placeholder:text-[var(--muted)] focus:border-[color:var(--accent)]"
                placeholder="Ajouter une note..."
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
              />
            </label>
            <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button className="btn-secondary" onClick={cancelEdit} type="button">
                Annuler
              </button>
              <button className="btn-primary disabled:cursor-not-allowed disabled:opacity-60" disabled={isSaving} onClick={saveNote} type="button">
                {isSaving ? "Enregistrement..." : editingNote || collapsedComposer ? "Enregistrer" : "Ajouter"}
              </button>
            </div>
          </>
        ) : null}
      </div>

      <div className={compact ? "grid gap-2" : "grid gap-3"}>
        {notes.map((note) => (
          <article key={note.id} className={`rounded-lg border border-[var(--border)] bg-[var(--surface-2)] ${compact ? "p-3" : "p-4"}`}>
            <p className="whitespace-pre-wrap text-sm leading-6 text-[var(--foreground)]">{note.content}</p>
            <div className={`${compact ? "mt-3" : "mt-4"} flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`}>
              <p className="text-xs font-semibold text-[var(--muted)]">Modifiée le {formatDateTime(note.updatedAt)}</p>
              <div className="flex gap-2">
                <button className="btn-secondary" onClick={() => startEdit(note)} type="button">
                  Modifier
                </button>
                <button className="btn-danger" onClick={() => setNoteToDelete(note)} type="button">
                  Supprimer
                </button>
              </div>
            </div>
          </article>
        ))}
        {notes.length === 0 ? (
          <p className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm text-[var(--muted)]">
            Aucune note pour le moment.
          </p>
        ) : null}
      </div>

      {noteToDelete ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 px-4 py-6">
          <div className="w-full max-w-lg rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 text-[var(--foreground)]">
            <h2 className="text-xl font-semibold">Supprimer la note ?</h2>
            <p className="mt-3 text-sm leading-6 text-[var(--muted)]">Voulez-vous vraiment supprimer cette note ?</p>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button className="btn-secondary" onClick={() => setNoteToDelete(null)} type="button">
                Annuler
              </button>
              <button className="btn-danger disabled:cursor-not-allowed disabled:opacity-60" disabled={isSaving} onClick={() => deleteNote(noteToDelete)} type="button">
                {isSaving ? "Suppression..." : "Supprimer"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("fr-CA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
