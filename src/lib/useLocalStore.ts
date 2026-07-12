"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import {
  loadLocalStore,
  resetDemoData as resetStoredDemoData,
  saveLocalStore,
  seedStore,
  STORAGE_KEY,
} from "./local-storage";
import type { LocalStore } from "./types";

const listeners = new Set<() => void>();
let cachedRaw: string | null = null;
let cachedStore: LocalStore = seedStore;
let hydrated = false;

function emitStoreChange() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  if (typeof window !== "undefined") {
    window.addEventListener("storage", listener);
    if (!hydrated) {
      hydrated = true;
      cachedRaw = window.localStorage.getItem(STORAGE_KEY);
      cachedStore = loadLocalStore();
      window.setTimeout(emitStoreChange, 0);
    }
  }

  return () => {
    listeners.delete(listener);

    if (typeof window !== "undefined") {
      window.removeEventListener("storage", listener);
    }
  };
}

export function useLocalStore() {
  const store = useSyncExternalStore(subscribe, getSnapshot, () => seedStore);

  const setPersistentStore = useCallback((updater: LocalStore | ((current: LocalStore) => LocalStore)) => {
    const currentStore = loadLocalStore();
    const nextStore = typeof updater === "function" ? updater(currentStore) : updater;

    saveLocalStore(nextStore);
    cachedRaw = JSON.stringify(nextStore);
    cachedStore = nextStore;
    emitStoreChange();
  }, []);

  return useMemo(
    () => ({
      store,
      setStore: setPersistentStore,
      resetDemoData,
    }),
    [setPersistentStore, store],
  );
}

export function resetDemoData() {
  const nextStore = resetStoredDemoData();

  cachedRaw = typeof window === "undefined" ? null : window.localStorage.getItem(STORAGE_KEY);
  cachedStore = nextStore;
  emitStoreChange();
  return nextStore;
}

function getSnapshot() {
  if (typeof window === "undefined") {
    return seedStore;
  }

  if (!hydrated) {
    return seedStore;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);

  if (raw === cachedRaw) {
    return cachedStore;
  }

  cachedRaw = raw;
  cachedStore = loadLocalStore();
  return cachedStore;
}

export function createId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}`;
}
