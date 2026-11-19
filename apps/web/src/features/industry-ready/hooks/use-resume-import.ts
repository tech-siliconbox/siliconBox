'use client';

import { ResumeImportResultSchema, fromJsonResume } from '@siliconbox/shared';
import { useState } from 'react';
import { useApiRequest } from './use-api-request';
import type { Account } from '../resume-draft';
import type { ResumeWorkspace } from './use-resume-workspace';

const outcome = (title: string, dropped: number, notes: string[] = []) =>
  [
    `Imported as a new resume, "${title}".`,
    dropped > 0 ? `${dropped} entries could not be read and were left out.` : '',
    ...notes,
  ]
    .filter(Boolean)
    .join(' ');

/** Imports that each become a new resume: a JSON Resume read here, or a file the server reads. */
export function useResumeImport(workspace: ResumeWorkspace, account: Account) {
  const { pending, error, request } = useApiRequest();
  const [done, setDone] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  async function fromJson(file: File): Promise<void> {
    setProblem(null);
    const value = await file
      .text()
      .then((text) => JSON.parse(text) as unknown)
      .catch(() => null);
    const imported = value === null ? null : fromJsonResume(value, account);
    if (imported === null) {
      setProblem('That file is not a JSON Resume we can read.');
      return;
    }
    await workspace.addFrom('Imported resume', imported.resume);
    setDone(outcome('Imported resume', imported.dropped));
  }

  /** Uploads to an import route, which makes the resume; the open one is saved first. */
  async function fromServer(
    url: string,
    file: File,
    fields: Record<string, string> = {},
  ): Promise<void> {
    if (!(await workspace.saveOpen())) return;
    const form = new FormData();
    form.set('file', file);
    for (const [name, value] of Object.entries(fields)) form.set(name, value);
    const response = await request(url, { method: 'POST', body: form });
    if (response === null) return;
    const result = ResumeImportResultSchema.parse(await response.json());
    workspace.adopt(result.saved);
    setDone(outcome(result.saved.title, result.dropped, result.notes));
  }

  return { pending, done, problem: problem ?? error, fromJson, fromServer };
}
