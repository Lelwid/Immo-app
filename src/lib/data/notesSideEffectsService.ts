import { createNote } from "@/lib/data/notesService";
import type { AppNote, LocalStore } from "@/lib/types";

type TenantNoteInput = {
  content?: string;
  propertyId: string;
  unitId: string;
  tenantId: string;
};

export async function applyTenantNoteSideEffect(store: LocalStore, input: TenantNoteInput): Promise<LocalStore> {
  const content = input.content?.trim();

  if (!content) {
    return store;
  }

  return runNoteSideEffect(store, async () => {
    const note = await createNote({
      targetType: "locataire",
      targetId: input.tenantId,
      propertyId: input.propertyId,
      unitId: input.unitId,
      tenantId: input.tenantId,
      content,
    });

    return {
      ...store,
      notes: upsertNote(store.notes, note),
    };
  }, "Impossible de créer la note du locataire.");
}

async function runNoteSideEffect(store: LocalStore, effect: () => Promise<LocalStore>, errorMessage: string) {
  try {
    return await effect();
  } catch (error) {
    console.error(errorMessage, error);
    return store;
  }
}

function upsertNote(notes: AppNote[], note: AppNote) {
  return notes.some((candidate) => candidate.id === note.id)
    ? notes.map((candidate) => (candidate.id === note.id ? note : candidate))
    : [note, ...notes];
}
