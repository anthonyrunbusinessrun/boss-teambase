"use client";

import { useCallback, useEffect, useState } from "react";
import { errorMessage } from "@/services";

export interface Resource<T> {
  data: T | undefined;
  loading: boolean;
  error: string | undefined;
  /** Re-fetch without flashing the loading state. */
  reload: () => Promise<void>;
  /** Optimistically replace the local copy. */
  setData: React.Dispatch<React.SetStateAction<T | undefined>>;
}

/**
 * Minimal data hook: loads once, exposes loading / error / reload.
 * `fetcher` must be referentially stable (a service function or a useCallback).
 */
export function useResource<T>(fetcher: () => Promise<T>): Resource<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);

  const run = useCallback(async () => {
    try {
      const next = await fetcher();
      setData(next);
      setError(undefined);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [fetcher]);

  useEffect(() => {
    let cancelled = false;
    fetcher()
      .then((next) => {
        if (cancelled) return;
        setData(next);
        setError(undefined);
      })
      .catch((e) => {
        if (!cancelled) setError(errorMessage(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetcher]);

  return { data, loading, error, reload: run, setData };
}
