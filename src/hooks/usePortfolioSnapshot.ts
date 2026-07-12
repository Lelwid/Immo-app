"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getDataMode, type DataMode } from "@/lib/data/dataMode";
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
  data: LocalStore;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<PortfolioSnapshot | null>;
  clearCache: () => void;
  dataMode: DataMode;
  source: PortfolioSnapshotSource;
  usingFallbackData: boolean;
};

const snapshotErrorMessage = "Impossible de charger les données du portefeuille.";

export function usePortfolioSnapshot(): PortfolioSnapshotHook {
  const { store } = useLocalStore();
  const [snapshot, setSnapshot] = useState<PortfolioSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dataMode, setDataModeState] = useState<DataMode>("local");
  const mountedRef = useRef(false);
  const requestIdRef = useRef(0);

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
    const timer = window.setTimeout(() => {
      void applySnapshotLoad(() => loadPortfolioSnapshot(), true);
    }, 0);

    return () => {
      window.clearTimeout(timer);
      mountedRef.current = false;
      requestIdRef.current += 1;
    };
  }, [applySnapshotLoad]);

  const refresh = useCallback(() => applySnapshotLoad(() => refreshSnapshot(), false), [applySnapshotLoad]);

  const clearCache = useCallback(() => {
    clearPortfolioSnapshotCache();
    setSnapshot(null);
    setError(null);
  }, []);

  const data = snapshot ?? store;
  const source: PortfolioSnapshotSource = dataMode === "local" ? (snapshot ? "snapshot" : "local") : snapshot ? "snapshot" : "fallback";

  return useMemo(
    () => ({
      snapshot,
      data,
      loading,
      error,
      refresh,
      clearCache,
      dataMode,
      source,
      usingFallbackData: source === "fallback",
    }),
    [clearCache, data, dataMode, error, loading, refresh, snapshot, source],
  );
}
