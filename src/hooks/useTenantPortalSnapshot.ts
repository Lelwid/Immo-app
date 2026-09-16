"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { DATA_MODE_CHANGED_EVENT, getDataMode, type DataMode } from "@/lib/data/dataMode";
import { getTenantPortalSnapshot, type TenantPortalSnapshot } from "@/lib/data/tenantPortalService";

type TenantPortalSnapshotHook = {
  data: TenantPortalSnapshot | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<TenantPortalSnapshot | null>;
  clear: () => void;
  dataMode: DataMode;
  isReady: boolean;
  isSupabaseMode: boolean;
};

const tenantPortalError = "Impossible de charger les données du portail locataire.";

export function useTenantPortalSnapshot(options: { enabled?: boolean } = {}): TenantPortalSnapshotHook {
  const enabled = options.enabled ?? true;
  const { configured, loading: authLoading, user } = useAuth();
  const [data, setData] = useState<TenantPortalSnapshot | null>(null);
  const [dataMode, setDataModeState] = useState<DataMode>(() => getDataMode());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(false);
  const requestIdRef = useRef(0);
  const contextKeyRef = useRef(`${getDataMode()}:${user?.id ?? "anonymous"}`);

  const loadSnapshot = useCallback(async (showLoading: boolean) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setDataModeState(getDataMode());

    if (showLoading) {
      setLoading(true);
    }

    try {
      const snapshot = await getTenantPortalSnapshot();

      if (!mountedRef.current || requestId !== requestIdRef.current) {
        return null;
      }

      setData(snapshot);
      setError(null);
      return snapshot;
    } catch (loadError) {
      if (!mountedRef.current || requestId !== requestIdRef.current) {
        return null;
      }

      console.error(tenantPortalError, loadError);
      setData(null);
      setError(tenantPortalError);
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
      setData(null);
      setError(null);
      setDataModeState(nextDataMode);
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
      void loadSnapshot(true);
    }, 0);

    return () => {
      window.clearTimeout(timer);
      mountedRef.current = false;
      requestIdRef.current += 1;
    };
  }, [authLoading, configured, enabled, loadSnapshot, user, user?.id]);

  useEffect(() => {
    function handleDataModeChange() {
      requestIdRef.current += 1;
      setData(null);
      setError(null);
      setDataModeState(getDataMode());

      if (enabled) {
        void loadSnapshot(true);
      }
    }

    window.addEventListener(DATA_MODE_CHANGED_EVENT, handleDataModeChange);
    return () => window.removeEventListener(DATA_MODE_CHANGED_EVENT, handleDataModeChange);
  }, [enabled, loadSnapshot]);

  const refresh = useCallback(() => loadSnapshot(false), [loadSnapshot]);

  const clear = useCallback(() => {
    requestIdRef.current += 1;
    setData(null);
    setError(null);
    setDataModeState(getDataMode());
  }, []);

  const isSupabaseMode = dataMode === "supabase";
  const isReady = Boolean(data) || (!enabled && !isSupabaseMode);

  return useMemo(
    () => ({
      data,
      loading: enabled && (loading || (isSupabaseMode && configured && !data && !error)),
      error,
      refresh,
      clear,
      dataMode,
      isReady,
      isSupabaseMode,
    }),
    [clear, configured, data, dataMode, enabled, error, isReady, isSupabaseMode, loading, refresh],
  );
}
