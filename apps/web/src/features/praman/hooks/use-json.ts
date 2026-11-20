'use client';

import { ERRORS } from '@siliconbox/shared';
import { useEffect, useState } from 'react';

type Loaded<T> = { url: string | null; data: T | null; error: string | null };

/** Reads a file's answer, `{ text }`. */
export function readText(body: unknown): string | null {
  const text = (body as { text?: unknown } | null)?.text;
  return typeof text === 'string' ? text : null;
}

/**
 * GETs `url` (nothing while it is null) and reads the answer with `read`, a function defined
 * outside the component so it stays the same between renders. `reload` asks again.
 */
export function useJson<T>(url: string | null, read: (body: unknown) => T | null) {
  const [loaded, setLoaded] = useState<Loaded<T>>({ url: null, data: null, error: null });
  const [round, setRound] = useState(0);

  useEffect(() => {
    if (url === null) return;
    let live = true;
    const load = async () => {
      const response = await fetch(url).catch(() => null);
      const body: unknown = await response?.json().catch(() => null);
      const data = response?.ok === true ? read(body) : null;
      const message = (body as { error?: { message?: string } } | null)?.error?.message;
      const error = data === null ? (message ?? ERRORS.INTERNAL.message) : null;
      if (live) setLoaded({ url, data, error });
    };
    void load();
    return () => {
      live = false;
    };
  }, [url, read, round]);

  const current = loaded.url === url;
  return {
    data: current ? loaded.data : null,
    error: current ? loaded.error : null,
    loading: url !== null && !current,
    reload: () => setRound((before) => before + 1),
  };
}
