"use client";

import { useState } from "react";
import { createActivityRecord } from "@/lib/data/activitiesService";
import { addActivityToStore } from "@/lib/data/activityStore";
import { createTask as createTaskRecord } from "@/lib/data/tasksService";
import type { AppTask, LocalStore, TaskPriority } from "@/lib/types";
import { useLocalStore } from "@/lib/useLocalStore";

type TaskComposerProps = {
  propertyId?: string;
  unitId?: string;
  tenantId?: string | null;
  title?: string;
  compact?: boolean;
  storeSource?: LocalStore;
  onChanged?: () => void | Promise<void>;
};

export function TaskComposer({ compact = false, onChanged, propertyId, storeSource, tenantId, title = "Créer une tâche personnelle", unitId }: TaskComposerProps) {
  const { store, setStore } = useLocalStore();
  const taskStore = storeSource ?? store;
  const [taskTitle, setTaskTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("moyenne");
  const [dueDate, setDueDate] = useState(() => new Date().toISOString().slice(0, 10));

  async function createTask() {
    if (!taskTitle.trim()) {
      return;
    }

    const now = new Date().toISOString();
    let task: AppTask;

    try {
      task = await createTaskRecord({
        title: taskTitle.trim(),
        description: description.trim(),
        completed: false,
        priority,
        dueDate,
        propertyId,
        unitId,
        tenantId: tenantId ?? null,
        createdAt: now,
      });

      setStore((current) => ({
        ...current,
        tasks: upsertTaskInStore(current.tasks, task),
      }));
      await onChanged?.();
    } catch (error) {
      console.error("Impossible de créer la tâche.", error);
      return;
    }

    try {
      const activity = await createActivityRecord({
        propertyId: task.propertyId ?? taskStore.properties[0]?.id ?? "",
        unitId: task.unitId,
        tenantId: task.tenantId,
        type: "tache",
        title: "Tâche personnelle créée",
        description: `La tâche personnelle « ${task.title} » a été créée.`,
      });

      setStore((current) => addActivityToStore(current, activity));
      await onChanged?.();
    } catch (error) {
      console.error("Impossible de créer l'activité de tâche.", error);
    }

    setTaskTitle("");
    setDescription("");
    setPriority("moyenne");
    setDueDate(new Date().toISOString().slice(0, 10));
  }

  return (
    <section className={`rounded-lg border border-[var(--border)] bg-[var(--surface-2)] ${compact ? "p-4" : "p-5"}`}>
      <h3 className="font-semibold text-[var(--foreground)]">{title}</h3>
      <div className="mt-4 grid gap-3">
        <TextInput label="Titre" value={taskTitle} onChange={setTaskTitle} />
        {!compact ? (
          <label className="grid gap-1 text-sm font-medium text-[var(--muted)]">
            Description
            <textarea
              className="min-h-24 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--foreground)] outline-none focus:border-[color:var(--accent)]"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-medium text-[var(--muted)]">
            Priorité
            <select
              className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--foreground)] outline-none focus:border-[color:var(--accent)]"
              value={priority}
              onChange={(event) => setPriority(event.target.value as TaskPriority)}
            >
              <option value="faible">Faible</option>
              <option value="moyenne">Moyenne</option>
              <option value="élevée">Élevée</option>
            </select>
          </label>
          <TextInput label="Échéance" type="date" value={dueDate} onChange={setDueDate} />
        </div>
        <button className="btn-primary" onClick={createTask} type="button">
          Ajouter la tâche personnelle
        </button>
      </div>
    </section>
  );
}

function upsertTaskInStore(tasks: AppTask[], task: AppTask) {
  return tasks.some((candidate) => candidate.id === task.id)
    ? tasks.map((candidate) => (candidate.id === task.id ? task : candidate))
    : [task, ...tasks];
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
        className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--foreground)] outline-none focus:border-[color:var(--accent)]"
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
