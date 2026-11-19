'use client';

import {
  API_ROUTES,
  type Resume,
  ResumeDocumentInputSchema,
  type ResumeSummary,
  ResumeSummarySchema,
} from '@siliconbox/shared';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { z } from 'zod';
import { errorMessage } from '@/lib/api-error';
import { useUndoHistory } from './use-undo-history';

export type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'invalid' | 'error';

/** The resume being edited; `publicId` is null until the first edit's save creates it. */
export type ResumeDraft = { publicId: string | null; title: string; resume: Resume };

const AUTOSAVE_DELAY_MS = 1500;

/** "experience 2 · start: Use YYYY-MM", so the learner knows which field to fix. */
function describeIssue(issue: z.core.$ZodIssue | undefined): string {
  if (issue === undefined) return 'Some fields are not valid.';
  const where = issue.path
    .filter((part) => part !== 'resume')
    .map((part) => (typeof part === 'number' ? String(part + 1) : String(part)))
    .join(' · ');
  return `${where}: ${issue.message}`;
}

const clean = (bullets: string[]) =>
  bullets.map((bullet) => bullet.trim()).filter((bullet) => bullet !== '');

/** Drops the empty bullet lines the editor keeps while the learner types. */
function withoutEmptyBullets(resume: Resume): Resume {
  return {
    ...resume,
    experience: resume.experience.map((job) => ({ ...job, bullets: clean(job.bullets) })),
    projects: resume.projects.map((project) => ({ ...project, bullets: clean(project.bullets) })),
    custom: resume.custom.map((section) => ({
      ...section,
      items: section.items.map((item) => ({ ...item, bullets: clean(item.bullets) })),
    })),
  };
}

/** Creates the resume on its first save, then saves it in place; the API's message on failure. */
async function send(draft: ResumeDraft, body: unknown): Promise<ResumeSummary | string> {
  const url = draft.publicId === null ? API_ROUTES.resumes : API_ROUTES.resume(draft.publicId);
  const response = await fetch(url, {
    method: draft.publicId === null ? 'POST' : 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => null);
  if (response?.ok !== true) return errorMessage(response);
  return ResumeSummarySchema.parse(await response.json());
}

type Saved = { saved: ResumeSummary } | { status: 'invalid' | 'error'; problem: string };

/** Checks the draft against the schema and saves it, or says which field to fix or what failed. */
async function saveDraft(draft: ResumeDraft): Promise<Saved> {
  const parsed = ResumeDocumentInputSchema.safeParse({
    title: draft.title,
    resume: withoutEmptyBullets(draft.resume),
  });
  if (!parsed.success) return { status: 'invalid', problem: describeIssue(parsed.error.issues[0]) };
  const result = await send(draft, parsed.data);
  return typeof result === 'string' ? { status: 'error', problem: result } : { saved: result };
}

/**
 * Saves a moment after the last edit (each edit restarts the wait) and on Ctrl/Cmd+S, and warns
 * before leaving with edits not saved.
 */
function useSaveTriggers(status: SaveStatus, draft: ResumeDraft, save: () => Promise<unknown>) {
  const saveNow = useEffectEvent(() => void save());
  const onLeave = useEffectEvent((event: BeforeUnloadEvent) => {
    if (status !== 'saved' && status !== 'error') event.preventDefault();
  });

  useEffect(() => {
    if (status !== 'unsaved') return;
    const timer = setTimeout(saveNow, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [status, draft]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        saveNow();
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('beforeunload', onLeave);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('beforeunload', onLeave);
    };
  }, []);
}

/** The draft, its save state and a version that every edit or load moves on. */
function useDraftState(initial: ResumeDraft) {
  const [draft, setDraft] = useState(initial);
  const [status, setStatus] = useState<SaveStatus>('saved');
  const [problem, setProblem] = useState<string | null>(null);
  const version = useRef(0);
  const change = (next: ResumeDraft, nextStatus: SaveStatus = 'unsaved') => {
    version.current += 1;
    setDraft(next);
    setStatus(nextStatus);
    if (nextStatus === 'saved') setProblem(null);
  };
  return { draft, setDraft, status, setStatus, problem, setProblem, version, change };
}

/**
 * The resume being edited: autosaved a moment after the learner stops typing (and on Ctrl/Cmd+S),
 * with undo and redo. A save that finishes after newer edits leaves them unsaved, so they save next.
 */
export function useResumeDraft(initial: ResumeDraft, onSaved: (saved: ResumeSummary) => void) {
  const state = useDraftState(initial);
  const { draft, setDraft, status, setStatus, setProblem, version, change } = state;
  const history = useUndoHistory<Resume>();
  const show = (resume: Resume | undefined) => resume !== undefined && change({ ...draft, resume });

  async function save(): Promise<ResumeSummary | null> {
    const startedAt = version.current;
    setStatus('saving');
    const result = await saveDraft(draft);
    setProblem('saved' in result ? null : result.problem);
    if (!('saved' in result)) {
      setStatus(result.status);
      return null;
    }
    if (draft.publicId === null)
      setDraft((current) => ({ ...current, publicId: result.saved.publicId }));
    setStatus(version.current === startedAt ? 'saved' : 'unsaved');
    onSaved(result.saved);
    return result.saved;
  }
  useSaveTriggers(status, draft, save);

  return {
    draft,
    status,
    problem: state.problem,
    save,
    update: (resume: Resume) => {
      history.record(draft.resume);
      change({ ...draft, resume });
    },
    rename: (title: string) => change({ ...draft, title }),
    undo: () => show(history.undo(draft.resume)),
    redo: () => show(history.redo(draft.resume)),
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    /** Opens another resume in the editor, with a fresh undo history. */
    load: (next: ResumeDraft) => {
      history.reset();
      change(next, 'saved');
    },
  };
}
