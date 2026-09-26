"use client";

import { useMemo, useState } from "react";
import { RouteShell } from "@/app/components/route-shell";
import { AppIcon, type IconName } from "@/components/AppIcon";
import { TaskComposer } from "@/components/TaskComposer";
import { emptyPortfolioStore, usePortfolioSnapshot } from "@/hooks/usePortfolioSnapshot";
import { createActivityRecord } from "@/lib/data/activitiesService";
import { addActivityToStore } from "@/lib/data/activityStore";
import { getUnitOccupancy } from "@/lib/data/leaseAdapters";
import { completeTask, deleteTask as deleteTaskRecord, updateTask } from "@/lib/data/tasksService";
import { getPropertyName, getTenantName, getUnitLabel } from "@/lib/mockData";
import type { AppTask, LocalStore, TaskPriority } from "@/lib/types";
import { useLocalStore } from "@/lib/useLocalStore";

type TaskFilter = "toutes" | "aujourdhui" | "retard" | "priorite";
type TaskForm = Pick<AppTask, "title" | "description" | "priority" | "dueDate" | "propertyId" | "unitId" | "tenantId">;

const filters: { icon: IconName; label: string; value: TaskFilter }[] = [
  { icon: "list", label: "Toutes", value: "toutes" },
  { icon: "clock", label: "Aujourd'hui", value: "aujourdhui" },
  { icon: "circle-alert", label: "En retard", value: "retard" },
  { icon: "list-checks", label: "Priorité élevée", value: "priorite" },
];

const priorityClasses: Record<TaskPriority, string> = {
  faible: "border-[var(--border)] bg-[var(--surface-3)] text-[var(--muted)]",
  moyenne: "border-[color:var(--yellow)]/35 bg-[color:var(--yellow)]/10 text-[color:var(--yellow)]",
  élevée: "border-[color:var(--red)]/35 bg-[color:var(--red)]/10 text-[color:var(--red)]",
};

export default function TachesPage() {
  const { setStore } = useLocalStore();
  const { data, error: snapshotError, loading: snapshotLoading, refresh: refreshSnapshot } = usePortfolioSnapshot();
  const snapshotStore = data ?? emptyPortfolioStore;
  const [activeFilter, setActiveFilter] = useState<TaskFilter>("toutes");
  const [editingTask, setEditingTask] = useState<AppTask | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<AppTask | null>(null);
  const filteredTasks = useMemo(() => getFilteredTasks(snapshotStore.tasks, activeFilter), [activeFilter, snapshotStore.tasks]);
  const todoTasks = filteredTasks.filter((task) => !task.completed);
  const completedTasks = filteredTasks.filter((task) => task.completed);

  async function refreshTasksSnapshot() {
    try {
      await refreshSnapshot();
    } catch (error) {
      console.error("Impossible de rafraîchir les tâches.", error);
    }
  }

  async function markComplete(task: AppTask) {
    let savedTask: AppTask;

    try {
      savedTask = await completeTask(task.id);
      setStore((current) => ({
        ...current,
        tasks: current.tasks.map((candidate) => (candidate.id === task.id ? savedTask : candidate)),
      }));
      await refreshTasksSnapshot();
    } catch (error) {
      console.error("Impossible de terminer la tâche.", error);
      return;
    }

    try {
      const activity = await createActivityRecord({
        propertyId: task.propertyId ?? snapshotStore.properties[0]?.id ?? "",
        unitId: task.unitId,
        tenantId: task.tenantId,
        type: "tache",
        title: "Tâche personnelle terminée",
        description: `La tâche personnelle « ${task.title} » a été marquée comme terminée.`,
      });

      setStore((current) => addActivityToStore(current, activity));
      await refreshTasksSnapshot();
    } catch (error) {
      console.error("Impossible de créer l'activité de tâche.", error);
    }
  }

  async function saveTask(form: TaskForm) {
    if (!editingTask || !form.title.trim()) {
      return;
    }

    let savedTask: AppTask;

    try {
      savedTask = await updateTask(editingTask.id, { ...form, title: form.title.trim() });
      setStore((current) => ({
        ...current,
        tasks: current.tasks.map((task) => (task.id === editingTask.id ? savedTask : task)),
      }));
      await refreshTasksSnapshot();
    } catch (error) {
      console.error("Impossible de modifier la tâche.", error);
      return;
    }

    try {
      const activity = await createActivityRecord({
        propertyId: savedTask.propertyId ?? snapshotStore.properties[0]?.id ?? "",
        unitId: savedTask.unitId,
        tenantId: savedTask.tenantId,
        type: "tache",
        title: "Tâche personnelle modifiée",
        description: `La tâche personnelle « ${savedTask.title} » a été modifiée.`,
      });

      setStore((current) => addActivityToStore(current, activity));
      await refreshTasksSnapshot();
    } catch (error) {
      console.error("Impossible de créer l'activité de tâche.", error);
    }

    setEditingTask(null);
  }

  async function deleteTask(task: AppTask) {
    try {
      await deleteTaskRecord(task.id);
      setStore((current) => ({
        ...current,
        tasks: current.tasks.filter((candidate) => candidate.id !== task.id),
      }));
      await refreshTasksSnapshot();
    } catch (error) {
      console.error("Impossible de supprimer la tâche.", error);
      return;
    }

    try {
      const activity = await createActivityRecord({
        propertyId: task.propertyId ?? snapshotStore.properties[0]?.id ?? "",
        unitId: task.unitId,
        tenantId: task.tenantId,
        type: "tache",
        title: "Tâche personnelle supprimée",
        description: `La tâche personnelle « ${task.title} » a été supprimée.`,
      });

      setStore((current) => addActivityToStore(current, activity));
      await refreshTasksSnapshot();
    } catch (error) {
      console.error("Impossible de créer l'activité de tâche.", error);
    }

    setTaskToDelete(null);
  }

  return (
    <RouteShell title="Mes tâches" description="Suivez les actions personnelles à faire pour gérer votre portefeuille.">
      {!data ? (
        <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
          <p className="text-sm font-semibold text-[var(--muted)]">
            {snapshotLoading ? "Chargement des tâches..." : "Impossible de charger les données du portefeuille."}
          </p>
          {snapshotError ? <p className="mt-2 text-sm text-[color:var(--yellow)]">{snapshotError}</p> : null}
          {snapshotError ? (
            <button className="btn-secondary mt-4" onClick={() => void refreshSnapshot()} type="button">
              Réessayer
            </button>
          ) : null}
        </section>
      ) : null}
      {data ? (
      <section className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <div className="grid gap-5">
          <div className="flex flex-wrap gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
            {snapshotLoading ? <p className="w-full text-xs font-semibold uppercase text-[var(--muted)]">Synchronisation des tâches...</p> : null}
            {snapshotError ? <p className="w-full text-sm font-semibold text-[color:var(--yellow)]">{snapshotError}</p> : null}
            {filters.map((filter) => (
              <button
                key={filter.value}
                className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition ${
                  activeFilter === filter.value
                    ? "bg-[color:var(--accent)] text-white"
                    : "text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"
                }`}
                onClick={() => setActiveFilter(filter.value)}
                type="button"
              >
                <AppIcon name={filter.icon} size={16} />
                <span>{filter.label}</span>
              </button>
            ))}
          </div>

          <TaskSection
            emptyText="Aucune tâche personnelle à faire."
            onDelete={setTaskToDelete}
            onEdit={setEditingTask}
            onMarkComplete={markComplete}
            store={snapshotStore}
            tasks={todoTasks}
            title="À faire"
          />
          <TaskSection
            completed
            emptyText="Aucune tâche personnelle terminée."
            onDelete={setTaskToDelete}
            onEdit={setEditingTask}
            onMarkComplete={markComplete}
            store={snapshotStore}
            tasks={completedTasks}
            title="Terminées"
          />
        </div>

        <aside className="xl:sticky xl:top-5 xl:self-start">
          <TaskComposer onChanged={refreshTasksSnapshot} storeSource={snapshotStore} title="Nouvelle tâche personnelle" />
        </aside>
      </section>
      ) : null}

      {data && editingTask ? <TaskEditModal task={editingTask} store={snapshotStore} onCancel={() => setEditingTask(null)} onSave={saveTask} /> : null}
      {data && taskToDelete ? (
        <ConfirmModal
          onCancel={() => setTaskToDelete(null)}
          onConfirm={() => deleteTask(taskToDelete)}
          title="Supprimer la tâche personnelle ?"
          message="Voulez-vous vraiment supprimer cette tâche personnelle ?"
        />
      ) : null}
    </RouteShell>
  );
}

function TaskSection({
  completed = false,
  emptyText,
  onDelete,
  onEdit,
  onMarkComplete,
  store,
  tasks,
  title,
}: {
  completed?: boolean;
  emptyText: string;
  onDelete: (task: AppTask) => void;
  onEdit: (task: AppTask) => void;
  onMarkComplete: (task: AppTask) => void | Promise<void>;
  store: LocalStore;
  tasks: AppTask[];
  title: string;
}) {
  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-[var(--foreground)]">{title}</h2>
        <span className="rounded-full border border-[var(--border)] bg-[var(--surface-3)] px-3 py-1 text-xs font-semibold text-[var(--muted)]">
          {tasks.length}
        </span>
      </div>
      <div className="mt-4 grid gap-3">
        {tasks.map((task) => (
          <article key={task.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${priorityClasses[task.priority]}`}>
                    {task.priority}
                  </span>
                  <span className="text-xs font-semibold text-[var(--muted)]">Échéance {formatDate(task.dueDate)}</span>
                </div>
                <h3 className="mt-3 font-semibold text-[var(--foreground)]">{task.title}</h3>
                <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{task.description || "Aucune description."}</p>
                <p className="mt-3 text-sm text-[var(--foreground)]">{getTaskContext(task, store)}</p>
              </div>
              <div className="flex flex-wrap gap-2 lg:justify-end">
                {!completed ? (
                  <button className="btn-primary" onClick={() => onMarkComplete(task)} type="button">
                    Terminer
                  </button>
                ) : null}
                <button className="btn-secondary" onClick={() => onEdit(task)} type="button">
                  Modifier
                </button>
                <button className="btn-danger" onClick={() => onDelete(task)} type="button">
                  Supprimer
                </button>
              </div>
            </div>
          </article>
        ))}
        {tasks.length === 0 ? (
          <p className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm text-[var(--muted)]">{emptyText}</p>
        ) : null}
      </div>
    </section>
  );
}

function TaskEditModal({
  onCancel,
  onSave,
  store,
  task,
}: {
  onCancel: () => void;
  onSave: (form: TaskForm) => void | Promise<void>;
  store: LocalStore;
  task: AppTask;
}) {
  const [form, setForm] = useState<TaskForm>({
    title: task.title,
    description: task.description,
    priority: task.priority,
    dueDate: task.dueDate,
    propertyId: task.propertyId,
    unitId: task.unitId,
    tenantId: task.tenantId,
  });
  const availableUnits = store.units.filter((unit) => !form.propertyId || unit.propertyId === form.propertyId);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-2 sm:items-center sm:px-4 sm:py-6">
      <div className="custom-scrollbar max-h-[calc(100dvh-1rem)] w-full max-w-xl overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-[var(--foreground)] sm:max-h-[90dvh] sm:p-6">
        <h2 className="text-2xl font-semibold">Modifier la tâche personnelle</h2>
        <div className="mt-5 grid gap-3">
          <TextInput label="Titre" value={form.title} onChange={(title) => setForm({ ...form, title })} />
          <label className="grid gap-1 text-sm font-medium text-[var(--muted)]">
            Description
            <textarea
              className="min-h-28 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[var(--foreground)] outline-none focus:border-[color:var(--accent)]"
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </label>
          <SelectInput
            label="Priorité"
            value={form.priority}
            onChange={(priority) => setForm({ ...form, priority: priority as TaskPriority })}
            options={[
              ["faible", "Faible"],
              ["moyenne", "Moyenne"],
              ["élevée", "Élevée"],
            ]}
          />
          <TextInput label="Échéance" type="date" value={form.dueDate} onChange={(dueDate) => setForm({ ...form, dueDate })} />
          <SelectInput
            label="Immeuble"
            value={form.propertyId ?? ""}
            onChange={(propertyId) => setForm({ ...form, propertyId: propertyId || undefined, unitId: undefined })}
            options={[["", "Aucun"], ...store.properties.map((property) => [property.id, property.name])]}
          />
          <SelectInput
            label="Logement"
            value={form.unitId ?? ""}
            onChange={(unitId) => {
              const unit = store.units.find((candidate) => candidate.id === unitId);
              const occupancy = unit ? getUnitOccupancy(unit, store.leases, store.tenants) : null;
              setForm({ ...form, unitId: unitId || undefined, tenantId: occupancy?.tenantId ?? null });
            }}
            options={[["", "Aucun"], ...availableUnits.map((unit) => [unit.id, unit.label])]}
          />
          <div className="mt-2 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button className="btn-secondary" onClick={onCancel} type="button">
              Annuler
            </button>
            <button className="btn-primary" onClick={() => onSave(form)} type="button">
              Enregistrer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConfirmModal({
  message,
  onCancel,
  onConfirm,
  title,
}: {
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-2 sm:items-center sm:px-4">
      <div className="max-h-[calc(100dvh-1rem)] w-full max-w-lg overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-6">
        <h2 className="text-xl font-semibold text-[var(--foreground)]">{title}</h2>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{message}</p>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button className="btn-secondary" onClick={onCancel} type="button">
            Annuler
          </button>
          <button className="btn-danger" onClick={onConfirm} type="button">
            Supprimer
          </button>
        </div>
      </div>
    </div>
  );
}

function TextInput({
  label,
  onChange,
  type = "text",
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  type?: string;
  value: string;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium text-[var(--muted)]">
      {label}
      <input
        className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[var(--foreground)] outline-none focus:border-[color:var(--accent)]"
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function SelectInput({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: string[][];
  value: string;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium text-[var(--muted)]">
      {label}
      <select
        className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[var(--foreground)] outline-none focus:border-[color:var(--accent)]"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function getFilteredTasks(tasks: AppTask[], filter: TaskFilter) {
  const today = new Date().toISOString().slice(0, 10);

  return [...tasks]
    .filter((task) => {
      if (filter === "aujourdhui") {
        return task.dueDate === today;
      }

      if (filter === "retard") {
        return !task.completed && task.dueDate < today;
      }

      if (filter === "priorite") {
        return task.priority === "élevée";
      }

      return true;
    })
    .sort((a, b) => Number(a.completed) - Number(b.completed) || a.dueDate.localeCompare(b.dueDate));
}

function getTaskContext(task: AppTask, store: LocalStore) {
  const parts = [
    task.propertyId ? getPropertyName(task.propertyId, store) : null,
    task.unitId ? getUnitLabel(task.unitId, store) : null,
    task.tenantId ? getTenantName(task.tenantId, store) : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" · ") : "Tâche personnelle";
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("fr-CA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00`));
}
