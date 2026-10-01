'use client';

import { API_ROUTES, type Resume, ResumeSchema } from '@siliconbox/shared';
import { useState } from 'react';
import type { z } from 'zod';

export type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'error';

/** "experience 1 · start: Use YYYY-MM", so the learner knows which field to fix. */
function describeIssue(issue: z.core.$ZodIssue | undefined): string {
  if (issue === undefined) return 'Some fields are not valid.';
  const where = issue.path
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
  };
}

/** The resume being edited, its save state, and a save that validates before sending. */
export function useResumeDraft(initial: Resume) {
  const [resume, setResume] = useState(initial);
  const [status, setStatus] = useState<SaveStatus>('saved');
  const [problem, setProblem] = useState<string | null>(null);

  function update(next: Resume) {
    setResume(next);
    setStatus('unsaved');
  }

  async function save(): Promise<boolean> {
    const parsed = ResumeSchema.safeParse(withoutEmptyBullets(resume));
    if (!parsed.success) {
      setStatus('error');
      setProblem(describeIssue(parsed.error.issues[0]));
      return false;
    }
    setStatus('saving');
    const response = await fetch(API_ROUTES.resume, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed.data),
    }).catch(() => null);
    const ok = response?.ok === true;
    setStatus(ok ? 'saved' : 'error');
    setProblem(ok ? null : 'Could not save. Please try again.');
    return ok;
  }

  return { resume, update, save, status, problem };
}
