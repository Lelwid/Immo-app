"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { getProperties } from "@/lib/data/propertiesService";
import { getDataErrorDiagnostics, withTransientRetry } from "@/lib/data/transientRetry";

let pendingPresenceCheck: { promise: Promise<number>; userId: string } | null = null;

export function usePortfolioPresence(options: { enabled: boolean; revalidationKey: string }) {
  const { configured, loading: authLoading, user } = useAuth();
  const [propertyCount, setPropertyCount] = useState<number | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadedContextKey, setLoadedContextKey] = useState("");
  const requestIdRef = useRef(0);
  const mountedRef = useRef(false);
  const ownerUserId = user?.id ?? "";
  const contextKey = options.enabled && configured && !authLoading && user?.id
    ? `${user.id}:${options.revalidationKey}`
    : "";

  const checkPresence = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError(false);

    try {
      const count = await loadPortfolioPresence(ownerUserId);
      if (mountedRef.current && requestId === requestIdRef.current) {
        setLoadedContextKey(contextKey);
        setPropertyCount(count);
      }
      return count;
    } catch (loadError) {
      if (mountedRef.current && requestId === requestIdRef.current) {
        const diagnostics = getDataErrorDiagnostics(loadError);
        console.error("[usePortfolioPresence] Impossible de vérifier la présence du portefeuille.", diagnostics);
        setLoadedContextKey(contextKey);
        setPropertyCount(null);
        setError(true);
      }
      return null;
    } finally {
      if (mountedRef.current && requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [contextKey, ownerUserId]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
    };
  }, []);

  useEffect(() => {
    if (!contextKey) {
      requestIdRef.current += 1;
      return;
    }

    const timer = window.setTimeout(() => {
      void checkPresence();
    }, 0);

    return () => {
      window.clearTimeout(timer);
      requestIdRef.current += 1;
    };
  }, [checkPresence, contextKey]);

  const hasCurrentResult = loadedContextKey === contextKey;
  const currentError = hasCurrentResult ? error : false;
  const currentPropertyCount = hasCurrentResult ? propertyCount : null;

  return {
    error: currentError,
    loading: options.enabled && (loading || (!currentError && currentPropertyCount === null)),
    propertyCount: currentPropertyCount,
    retry: checkPresence,
  };
}

async function loadPortfolioPresence(userId: string) {
  if (pendingPresenceCheck?.userId === userId) {
    return pendingPresenceCheck.promise;
  }

  const request = withTransientRetry(async () => (await getProperties({ userId })).length, {
    onRetry: ({ delayMs, error, nextAttempt }) => {
      const diagnostics = getDataErrorDiagnostics(error);
      console.warn("[usePortfolioPresence] Nouvelle tentative après une erreur transitoire.", {
        attempt: nextAttempt,
        code: diagnostics.code,
        delayMs,
        status: diagnostics.status,
      });
    },
  }).finally(() => {
    if (pendingPresenceCheck?.promise === request) {
      pendingPresenceCheck = null;
    }
  });

  pendingPresenceCheck = { promise: request, userId };
  return request;
}
