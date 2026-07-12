import { shouldUseSupabase } from "@/lib/data/dataMode";
import { loadLocalStore, saveLocalStore } from "@/lib/local-storage";
import { isSupabaseConfigured, supabase } from "@/lib/supabaseClient";
import type { AppNote, NoteTargetType } from "@/lib/types";

const table = "notes";

type SupabaseNoteRow = {
  id: string;
  user_id: string;
  target_type: string;
  target_id: string;
  property_id: string | null;
  unit_id: string | null;
  tenant_id: string | null;
  lease_id: string | null;
  content: string;
  created_at: string;
  updated_at: string;
};

export type NoteInput = {
  targetType: NoteTargetType;
  targetId: string;
  propertyId: string;
  unitId?: string;
  tenantId?: string | null;
  leaseId?: string | null;
  content: string;
};

export type NoteUpdateInput = Partial<NoteInput>;

const loadError = "Impossible de charger les notes.";
const createError = "Impossible de créer la note.";
const updateError = "Impossible de modifier la note.";
const deleteError = "Impossible de supprimer la note.";

export async function getNotes(): Promise<AppNote[]> {
  if (canUseSupabase()) {
    const { data, error } = await supabase!.from(table).select(selectColumns).order("updated_at", { ascending: false });

    if (error || !data) {
      throw new Error(loadError);
    }

    return data.map(fromSupabaseRow);
  }

  return sortNotes(loadLocalStore().notes);
}

export async function getNotesForTarget(targetType: NoteTargetType, targetId: string): Promise<AppNote[]> {
  if (canUseSupabase()) {
    const { data, error } = await supabase!
      .from(table)
      .select(selectColumns)
      .eq("target_type", targetType)
      .eq("target_id", targetId)
      .order("updated_at", { ascending: false });

    if (error || !data) {
      throw new Error(loadError);
    }

    return data.map(fromSupabaseRow);
  }

  return sortNotes(loadLocalStore().notes.filter((note) => note.targetType === targetType && note.targetId === targetId));
}

export async function createNote(input: NoteInput): Promise<AppNote> {
  const noteInput = normalizeNoteInput(input);

  if (canUseSupabase()) {
    const userId = await getCurrentUserId(createError);
    const { data, error } = await supabase!
      .from(table)
      .insert(toSupabaseInsert(noteInput, userId))
      .select(selectColumns)
      .single();

    if (error || !data) {
      throw new Error(createError);
    }

    return fromSupabaseRow(data);
  }

  const store = loadLocalStore();
  const now = new Date().toISOString();
  const note: AppNote = {
    id: createLocalNoteId(),
    ...noteInput,
    createdAt: now,
    updatedAt: now,
  };

  saveLocalStore({ ...store, notes: [note, ...store.notes] });
  return note;
}

export async function updateNote(noteId: string, input: NoteUpdateInput): Promise<AppNote> {
  if (canUseSupabase()) {
    const existing = await getNoteById(noteId, updateError);
    const nextInput = normalizeNoteInput({ ...existing, ...input });
    const { data, error } = await supabase!
      .from(table)
      .update(toSupabaseUpdate(nextInput))
      .eq("id", noteId)
      .select(selectColumns)
      .single();

    if (error || !data) {
      throw new Error(updateError);
    }

    return fromSupabaseRow(data);
  }

  const store = loadLocalStore();
  const existing = store.notes.find((note) => note.id === noteId);

  if (!existing) {
    throw new Error(updateError);
  }

  const nextNote: AppNote = {
    ...existing,
    ...input,
    content: input.content ?? existing.content,
    updatedAt: new Date().toISOString(),
  };

  saveLocalStore({
    ...store,
    notes: store.notes.map((note) => (note.id === noteId ? nextNote : note)),
  });

  return nextNote;
}

export async function deleteNote(noteId: string): Promise<void> {
  if (canUseSupabase()) {
    const { error } = await supabase!.from(table).delete().eq("id", noteId);

    if (error) {
      throw new Error(deleteError);
    }

    return;
  }

  const store = loadLocalStore();
  saveLocalStore({ ...store, notes: store.notes.filter((note) => note.id !== noteId) });
}

const selectColumns =
  "id,user_id,target_type,target_id,property_id,unit_id,tenant_id,lease_id,content,created_at,updated_at";

function canUseSupabase() {
  return shouldUseSupabase() && isSupabaseConfigured && Boolean(supabase);
}

async function getCurrentUserId(errorMessage: string) {
  const { data, error } = await supabase!.auth.getUser();

  if (error || !data.user?.id) {
    throw new Error(errorMessage);
  }

  return data.user.id;
}

async function getNoteById(noteId: string, errorMessage: string) {
  const { data, error } = await supabase!.from(table).select(selectColumns).eq("id", noteId).single();

  if (error || !data) {
    throw new Error(errorMessage);
  }

  return fromSupabaseRow(data);
}

function fromSupabaseRow(row: SupabaseNoteRow): AppNote {
  return {
    id: row.id,
    targetType: normalizeNoteTargetType(row.target_type),
    targetId: row.target_id,
    propertyId: row.property_id ?? "",
    unitId: row.unit_id ?? undefined,
    tenantId: row.tenant_id,
    leaseId: row.lease_id,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toSupabaseInsert(input: Required<NoteInput>, userId: string) {
  return {
    user_id: userId,
    target_type: input.targetType,
    target_id: input.targetId,
    property_id: input.propertyId || null,
    unit_id: input.unitId || null,
    tenant_id: input.tenantId || null,
    lease_id: input.leaseId || null,
    content: input.content,
  };
}

function toSupabaseUpdate(input: Required<NoteInput>) {
  return {
    target_type: input.targetType,
    target_id: input.targetId,
    property_id: input.propertyId || null,
    unit_id: input.unitId || null,
    tenant_id: input.tenantId || null,
    lease_id: input.leaseId || null,
    content: input.content,
  };
}

function normalizeNoteInput(input: NoteInput): Required<NoteInput> {
  return {
    targetType: input.targetType,
    targetId: input.targetId,
    propertyId: input.propertyId,
    unitId: input.unitId ?? "",
    tenantId: input.tenantId ?? null,
    leaseId: input.leaseId ?? null,
    content: input.content.trim(),
  };
}

function normalizeNoteTargetType(value: string): NoteTargetType {
  if (value === "immeuble" || value === "logement" || value === "locataire" || value === "entretien") {
    return value;
  }

  return "immeuble";
}

function sortNotes(notes: AppNote[]) {
  return [...notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function createLocalNoteId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `note-${crypto.randomUUID()}`;
  }

  return `note-${Date.now()}`;
}
