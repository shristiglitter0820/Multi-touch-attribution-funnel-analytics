"use client";
import { useEffect, useState } from "react";
import { api } from "./api";

/**
 * GET helper with explicit loading / error / data states.
 * `reload` is a counter: bump it to refetch (after a save, refresh, ...).
 * Pass url = null to skip. State is only set in async callbacks (no sync setState in the effect).
 */
export function useApi<T>(url: string | null, reload = 0) {
  const key = url === null ? null : `${url}#${reload}`;
  const [state, setState] = useState<{ key: string | null; data: T | null; error: string | null }>({ key: null, data: null, error: null });

  useEffect(() => {
    if (key === null || url === null) return;
    let cancelled = false;
    api<T>(url)
      .then((data) => { if (!cancelled) setState({ key, data, error: null }); })
      .catch((e: Error) => { if (!cancelled) setState({ key, data: null, error: e.message }); });
    return () => { cancelled = true; };
  }, [key, url]);

  const loading = key !== null && state.key !== key;
  return { data: loading ? null : state.data, error: loading ? null : state.error, loading };
}
