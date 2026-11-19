'use client';

import {
  API_ROUTES,
  type Resume,
  type ResumeSummary,
  type SavedResume,
  SavedResumeSchema,
  emptyResume,
} from '@siliconbox/shared';
import { useCallback, useState } from 'react';
import { useApiRequest } from './use-api-request';
import { type Account, type ResumeDraft, blankDraft, toDraft } from '../resume-draft';
import { useResumeDraft } from './use-resume-draft';

type Editor = ReturnType<typeof useResumeDraft>;

/** Waits for the open resume to be saved, so nothing on screen is lost when another opens. */
function savingGates(editor: Editor) {
  return {
    /** True once the open resume's edits are saved (or there were none). */
    saveOpen: async (): Promise<boolean> =>
      editor.status === 'saved' || (await editor.save()) !== null,
    /** The open resume's id once it is saved, or null when it cannot be. */
    settle: async (): Promise<string | null> => {
      const { publicId } = editor.draft;
      if (editor.status === 'saved' && publicId !== null) return publicId;
      return (await editor.save())?.publicId ?? null;
    },
  };
}

/** The learner's resumes, newest first; a saved resume moves to the top. */
function useResumeList(initial: ResumeSummary[]) {
  const [list, setList] = useState(initial);
  const remember = useCallback((saved: ResumeSummary) => {
    const summary = { publicId: saved.publicId, title: saved.title, updatedAt: saved.updatedAt };
    setList((current) => [summary, ...current.filter((r) => r.publicId !== saved.publicId)]);
  }, []);
  const forget = (publicId: string | null) => {
    const left = list.filter((r) => r.publicId !== publicId);
    setList(left);
    return left;
  };
  return { list, remember, forget };
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

/**
 * The learner's resumes and the one open in the editor: open, add (blank or a copy), adopt one
 * made on the server (an import), delete. The open resume is saved before another opens.
 */
export function useResumeWorkspace(initial: {
  list: ResumeSummary[];
  draft: ResumeDraft;
  account: Account;
}) {
  const { list, remember, forget } = useResumeList(initial.list);
  const editor = useResumeDraft(initial.draft, remember);
  const { pending, error, request } = useApiRequest();
  const gates = savingGates(editor);

  const loadFrom = async (response: Response | null) => {
    if (response !== null) adopt(SavedResumeSchema.parse(await response.json()));
  };
  function adopt(saved: SavedResume): void {
    remember(saved);
    editor.load(toDraft(saved));
  }
  async function add(title: string, resume: Resume): Promise<void> {
    if (await gates.saveOpen())
      await loadFrom(await request(API_ROUTES.resumes, json({ title, resume })));
  }
  async function remove(): Promise<void> {
    const { publicId } = editor.draft;
    if (
      publicId !== null &&
      (await request(API_ROUTES.resume(publicId), { method: 'DELETE' })) === null
    )
      return;
    const next = forget(publicId)[0];
    if (next === undefined) editor.load(blankDraft(initial.account));
    else await loadFrom(await request(API_ROUTES.resume(next.publicId), { method: 'GET' }));
  }

  return {
    list,
    editor,
    pending,
    error,
    ...gates,
    adopt,
    remove,
    addFrom: add,
    open: async (publicId: string) => {
      if (await gates.saveOpen())
        await loadFrom(await request(API_ROUTES.resume(publicId), { method: 'GET' }));
    },
    addBlank: () => add('New resume', emptyResume(initial.account.name, initial.account.email)),
    duplicate: () => add(`${editor.draft.title} (copy)`.slice(0, 60), editor.draft.resume),
  };
}
export type ResumeWorkspace = ReturnType<typeof useResumeWorkspace>;
