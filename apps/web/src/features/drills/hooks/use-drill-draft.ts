'use client';

import { useState, useSyncExternalStore } from 'react';

const key = (drillId: string) => `drill-draft:${drillId}`;
const noSubscription = () => () => undefined;

function readSaved(drillId: string): string | null {
  try {
    return window.localStorage.getItem(key(drillId));
  } catch {
    return null; // Storage blocked: fall back to the starter code.
  }
}

/**
 * The learner's properties for a Drill, kept in this browser between visits. A convenience:
 * when storage is unavailable the starter code is used and edits live only in the page.
 */
export function useDrillDraft(drillId: string, starterCode: string) {
  // The server renders the starter code; the browser then shows any saved draft.
  const saved = useSyncExternalStore(
    noSubscription,
    () => readSaved(drillId),
    () => null,
  );
  const [edited, setEdited] = useState<string | null>(null);

  const update = (next: string) => {
    setEdited(next);
    try {
      window.localStorage.setItem(key(drillId), next);
    } catch {
      // Storage blocked: the draft lives only in this page.
    }
  };
  return { code: edited ?? saved ?? starterCode, update, reset: () => update(starterCode) };
}
