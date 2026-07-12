import { shouldUseSupabase } from "@/lib/data/dataMode";
import { loadLocalStore, saveLocalStore } from "@/lib/local-storage";
import { isSupabaseConfigured, supabase } from "@/lib/supabaseClient";
import type { AppTask, TaskPriority } from "@/lib/types";

const table = "tasks";

type SupabaseTaskRow = {
  id: string;
  user_id: string;
  property_id: string | null;
  unit_id: string | null;
  tenant_id: string | null;
  lease_id: string | null;
  title: string;
  description: string | null;
  priority: string;
  due_date: string | null;
  completed: boolean | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TaskInput = {
  id?: string;
  title: string;
  description?: string;
  completed?: boolean;
  priority?: TaskPriority;
  dueDate?: string;
  propertyId?: string;
  unitId?: string;
  tenantId?: string | null;
  leaseId?: string | null;
  createdAt?: string;
  completedAt?: string | null;
};

export type TaskUpdateInput = Partial<TaskInput>;

const loadError = "Impossible de charger les tâches.";
const createError = "Impossible de créer la tâche.";
const updateError = "Impossible de modifier la tâche.";
const deleteError = "Impossible de supprimer la tâche.";

export async function getTasks(): Promise<AppTask[]> {
  if (canUseSupabase()) {
    const { data, error } = await supabase!
      .from(table)
      .select(selectColumns)
      .order("completed", { ascending: true })
      .order("due_date", { ascending: true, nullsFirst: false });

    if (error || !data) {
      throw new Error(loadError);
    }

    return data.map(fromSupabaseRow);
  }

  return sortTasks(loadLocalStore().tasks);
}

export async function getTasksForProperty(propertyId: string): Promise<AppTask[]> {
  if (canUseSupabase()) {
    const { data, error } = await supabase!
      .from(table)
      .select(selectColumns)
      .eq("property_id", propertyId)
      .order("completed", { ascending: true })
      .order("due_date", { ascending: true, nullsFirst: false });

    if (error || !data) {
      throw new Error(loadError);
    }

    return data.map(fromSupabaseRow);
  }

  return sortTasks(loadLocalStore().tasks.filter((task) => task.propertyId === propertyId));
}

export async function getTasksForUnit(unitId: string): Promise<AppTask[]> {
  if (canUseSupabase()) {
    const { data, error } = await supabase!
      .from(table)
      .select(selectColumns)
      .eq("unit_id", unitId)
      .order("completed", { ascending: true })
      .order("due_date", { ascending: true, nullsFirst: false });

    if (error || !data) {
      throw new Error(loadError);
    }

    return data.map(fromSupabaseRow);
  }

  return sortTasks(loadLocalStore().tasks.filter((task) => task.unitId === unitId));
}

export async function getTasksForTenant(tenantId: string): Promise<AppTask[]> {
  if (canUseSupabase()) {
    const { data, error } = await supabase!
      .from(table)
      .select(selectColumns)
      .eq("tenant_id", tenantId)
      .order("completed", { ascending: true })
      .order("due_date", { ascending: true, nullsFirst: false });

    if (error || !data) {
      throw new Error(loadError);
    }

    return data.map(fromSupabaseRow);
  }

  return sortTasks(loadLocalStore().tasks.filter((task) => task.tenantId === tenantId));
}

export async function getTasksForLease(leaseId: string): Promise<AppTask[]> {
  if (canUseSupabase()) {
    const { data, error } = await supabase!
      .from(table)
      .select(selectColumns)
      .eq("lease_id", leaseId)
      .order("completed", { ascending: true })
      .order("due_date", { ascending: true, nullsFirst: false });

    if (error || !data) {
      throw new Error(loadError);
    }

    return data.map(fromSupabaseRow);
  }

  return sortTasks(loadLocalStore().tasks.filter((task) => task.leaseId === leaseId));
}

export async function createTask(input: TaskInput): Promise<AppTask> {
  const taskInput = normalizeInput(input);

  if (canUseSupabase()) {
    const userId = await getCurrentUserId(createError);
    const { data, error } = await supabase!
      .from(table)
      .insert(toSupabaseInsert(taskInput, userId))
      .select(selectColumns)
      .single();

    if (error || !data) {
      throw new Error(createError);
    }

    return fromSupabaseRow(data);
  }

  const store = loadLocalStore();
  const task: AppTask = {
    ...taskInput,
    id: taskInput.id || createLocalTaskId(),
  };

  saveLocalStore({
    ...store,
    tasks: upsertLocalTask(store.tasks, task),
  });

  return task;
}

export async function updateTask(taskId: string, input: TaskUpdateInput): Promise<AppTask> {
  if (canUseSupabase()) {
    const existing = await getTaskById(taskId, updateError);
    const nextInput = normalizeInput({ ...existing, ...input, id: taskId });
    const { data, error } = await supabase!
      .from(table)
      .update(toSupabaseUpdate(nextInput))
      .eq("id", taskId)
      .select(selectColumns)
      .single();

    if (error || !data) {
      throw new Error(updateError);
    }

    return fromSupabaseRow(data);
  }

  const store = loadLocalStore();
  const existing = store.tasks.find((task) => task.id === taskId);

  if (!existing) {
    throw new Error(updateError);
  }

  const nextTask = normalizeTask({ ...existing, ...input, id: taskId });

  saveLocalStore({
    ...store,
    tasks: store.tasks.map((task) => (task.id === taskId ? nextTask : task)),
  });

  return nextTask;
}

export async function deleteTask(taskId: string): Promise<void> {
  if (canUseSupabase()) {
    const { error } = await supabase!.from(table).delete().eq("id", taskId);

    if (error) {
      throw new Error(deleteError);
    }

    return;
  }

  const store = loadLocalStore();
  saveLocalStore({ ...store, tasks: store.tasks.filter((task) => task.id !== taskId) });
}

export async function completeTask(taskId: string): Promise<AppTask> {
  return updateTask(taskId, {
    completed: true,
    completedAt: new Date().toISOString(),
  });
}

export async function reopenTask(taskId: string): Promise<AppTask> {
  return updateTask(taskId, {
    completed: false,
    completedAt: null,
  });
}

export async function listTasks(): Promise<AppTask[]> {
  return getTasks();
}

export async function upsertTask(task: AppTask) {
  const tasks = await getTasks();
  const existing = tasks.find((candidate) => candidate.id === task.id);

  return existing ? updateTask(task.id, task) : createTask(task);
}

export async function deleteTaskRecord(taskId: string) {
  return deleteTask(taskId);
}

const selectColumns =
  "id,user_id,property_id,unit_id,tenant_id,lease_id,title,description,priority,due_date,completed,completed_at,created_at,updated_at";

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

async function getTaskById(taskId: string, errorMessage: string): Promise<AppTask> {
  const { data, error } = await supabase!.from(table).select(selectColumns).eq("id", taskId).single();

  if (error || !data) {
    throw new Error(errorMessage);
  }

  return fromSupabaseRow(data);
}

function fromSupabaseRow(row: SupabaseTaskRow): AppTask {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    completed: Boolean(row.completed),
    priority: normalizePriority(row.priority),
    dueDate: row.due_date ?? "",
    propertyId: row.property_id ?? undefined,
    unitId: row.unit_id ?? undefined,
    tenantId: row.tenant_id,
    leaseId: row.lease_id,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

function toSupabaseInsert(input: Required<TaskInput>, userId: string) {
  return {
    ...(isUuid(input.id) ? { id: input.id } : {}),
    ...toSupabaseUpdate(input),
    user_id: userId,
  };
}

function toSupabaseUpdate(input: Required<TaskInput>) {
  return {
    property_id: input.propertyId || null,
    unit_id: input.unitId || null,
    tenant_id: input.tenantId || null,
    lease_id: input.leaseId || null,
    title: input.title,
    description: input.description?.trim() || null,
    priority: input.priority,
    due_date: input.dueDate || null,
    completed: input.completed,
    completed_at: input.completedAt || null,
  };
}

function normalizeInput(input: TaskInput): Required<TaskInput> {
  const now = new Date().toISOString();

  return {
    id: input.id ?? "",
    title: input.title.trim(),
    description: input.description ?? "",
    completed: Boolean(input.completed),
    priority: normalizePriority(input.priority),
    dueDate: input.dueDate ?? now.slice(0, 10),
    propertyId: input.propertyId ?? "",
    unitId: input.unitId ?? "",
    tenantId: input.tenantId ?? null,
    leaseId: input.leaseId ?? null,
    createdAt: input.createdAt ?? now,
    completedAt: input.completedAt ?? null,
  };
}

function normalizeTask(task: AppTask): AppTask {
  return {
    ...task,
    title: task.title.trim(),
    description: task.description ?? "",
    completed: Boolean(task.completed),
    priority: normalizePriority(task.priority),
    dueDate: task.dueDate || new Date().toISOString().slice(0, 10),
    propertyId: task.propertyId || undefined,
    unitId: task.unitId || undefined,
    tenantId: task.tenantId ?? null,
    leaseId: task.leaseId ?? null,
    completedAt: task.completed ? task.completedAt ?? new Date().toISOString() : null,
  };
}

function normalizePriority(priority: string | null | undefined): TaskPriority {
  if (priority === "faible" || priority === "moyenne" || priority === "élevée") {
    return priority;
  }

  return "moyenne";
}

function sortTasks(tasks: AppTask[]) {
  return [...tasks]
    .map(normalizeTask)
    .sort((a, b) => Number(a.completed) - Number(b.completed) || a.dueDate.localeCompare(b.dueDate));
}

function upsertLocalTask(tasks: AppTask[], task: AppTask) {
  return tasks.some((candidate) => candidate.id === task.id)
    ? tasks.map((candidate) => (candidate.id === task.id ? task : candidate))
    : [task, ...tasks];
}

function createLocalTaskId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `task-${crypto.randomUUID()}`;
  }

  return `task-${Date.now()}`;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
