"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { DATA_MODE_CHANGED_EVENT, getDataMode, type DataMode } from "@/lib/data/dataMode";
import {
  clearPortfolioSnapshotCache,
  loadPortfolioSnapshot,
  refreshSnapshot,
  type PortfolioSnapshot,
} from "@/lib/data/portfolioSnapshotService";
import type { LocalStore } from "@/lib/types";
import { useLocalStore } from "@/lib/useLocalStore";

type PortfolioSnapshotSource = "local" | "snapshot" | "fallback";

type PortfolioSnapshotHook = {
  snapshot: PortfolioSnapshot | null;
  data: LocalStore | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<PortfolioSnapshot | null>;
  clearCache: () => void;
  dataMode: DataMode;
  source: PortfolioSnapshotSource;
  isReady: boolean;
  isSupabaseMode: boolean;
  hasSnapshot: boolean;
  showInitialLoader: boolean;
  usingFallbackData: boolean;
};

const snapshotErrorMessage = "Impossible de charger les données du portefeuille.";

export const emptyPortfolioStore: LocalStore = {
  activities: [],
  documents: [],
  leases: [],
  maintenanceTickets: [],
  notes: [],
  payments: [],
  paymentAllocations: [],
  paymentTransactions: [],
  properties: [],
  rentCharges: [],
  tasks: [],
  tenants: [],
  units: [],
};

export function usePortfolioSnapshot(options: { enabled?: boolean } = {}): PortfolioSnapshotHook {
  const enabled = options.enabled ?? true;
  const { store } = useLocalStore();
  const { configured, loading: authLoading, user } = useAuth();
  const [snapshot, setSnapshot] = useState<PortfolioSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dataMode, setDataModeState] = useState<DataMode>(() => getDataMode());
  const mountedRef = useRef(false);
  const requestIdRef = useRef(0);
  const contextKeyRef = useRef(`${getDataMode()}:${user?.id ?? "anonymous"}`);

  const applySnapshotLoad = useCallback(async (loader: () => Promise<PortfolioSnapshot>, showLoading: boolean) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setDataModeState(getDataMode());

    if (showLoading) {
      setLoading(true);
    }

    try {
      const nextSnapshot = await loader();

      if (!mountedRef.current || requestId !== requestIdRef.current) {
        return null;
      }

      setSnapshot(nextSnapshot);
      setError(null);
      return nextSnapshot;
    } catch (loadError) {
      if (!mountedRef.current || requestId !== requestIdRef.current) {
        return null;
      }

      console.error(snapshotErrorMessage, loadError);
      setError(snapshotErrorMessage);
      return null;
    } finally {
      if (mountedRef.current && requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const nextDataMode = getDataMode();
    const nextContextKey = `${nextDataMode}:${user?.id ?? "anonymous"}`;

    if (contextKeyRef.current !== nextContextKey) {
      contextKeyRef.current = nextContextKey;
      requestIdRef.current += 1;
      setSnapshot(null);
      setError(null);
      setLoading(enabled && nextDataMode === "supabase");
      setDataModeState(nextDataMode);
      clearPortfolioSnapshotCache();
    } else {
      setDataModeState(nextDataMode);
    }

    if (!enabled) {
      return () => {
        mountedRef.current = false;
        requestIdRef.current += 1;
      };
    }

    if (nextDataMode === "supabase" && configured && (authLoading || !user)) {
      return () => {
        mountedRef.current = false;
        requestIdRef.current += 1;
      };
    }

    const timer = window.setTimeout(() => {
      void applySnapshotLoad(() => loadPortfolioSnapshot(), true);
    }, 0);

    return () => {
      window.clearTimeout(timer);
      mountedRef.current = false;
      requestIdRef.current += 1;
    };
  }, [applySnapshotLoad, authLoading, configured, enabled, user, user?.id]);

  useEffect(() => {
    function handleDataModeChange() {
      const nextDataMode = getDataMode();
      requestIdRef.current += 1;
      setSnapshot(null);
      setError(null);
      setLoading(enabled && nextDataMode === "supabase");
      setDataModeState(nextDataMode);
      clearPortfolioSnapshotCache();

      if (enabled && nextDataMode === "supabase" && (!configured || user)) {
        void applySnapshotLoad(() => refreshSnapshot(), true);
      }
    }

    window.addEventListener(DATA_MODE_CHANGED_EVENT, handleDataModeChange);
    return () => window.removeEventListener(DATA_MODE_CHANGED_EVENT, handleDataModeChange);
  }, [applySnapshotLoad, configured, enabled, user]);

  const refresh = useCallback(() => applySnapshotLoad(() => refreshSnapshot(), false), [applySnapshotLoad]);

  const clearCache = useCallback(() => {
    clearPortfolioSnapshotCache();
    setSnapshot(null);
    setError(null);
    setDataModeState(getDataMode());
  }, []);

  const isSupabaseMode = dataMode === "supabase";
  const hasSnapshot = Boolean(snapshot);
  const data = isSupabaseMode ? snapshot : (snapshot ?? store);
  const source: PortfolioSnapshotSource = isSupabaseMode ? (snapshot ? "snapshot" : "fallback") : snapshot ? "snapshot" : "local";
  const canLoadSupabaseSnapshot = !isSupabaseMode || !configured || Boolean(user);
  const showInitialLoader = enabled && isSupabaseMode && canLoadSupabaseSnapshot && !snapshot && !error;
  const effectiveLoading = enabled && (loading || showInitialLoader);
  const isReady = !enabled || (!isSupabaseMode && Boolean(data)) || (isSupabaseMode && Boolean(snapshot));

  return useMemo(
    () => ({
      snapshot,
      data,
      loading: effectiveLoading,
      error,
      refresh,
      clearCache,
      dataMode,
      source,
      isReady,
      isSupabaseMode,
      hasSnapshot,
      showInitialLoader,
      usingFallbackData: false,
    }),
    [clearCache, data, dataMode, effectiveLoading, error, hasSnapshot, isReady, isSupabaseMode, refresh, showInitialLoader, snapshot, source],
  );
}
