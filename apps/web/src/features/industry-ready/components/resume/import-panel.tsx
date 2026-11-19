'use client';

import { AI_NOTICE_VERSION, API_ROUTES } from '@siliconbox/shared';
import { type ChangeEvent, type ReactNode, useState } from 'react';
import { FileInput } from '@/components/ui/file-input';
import { FormError } from '@/components/ui/form-error';
import { EYEBROW_CLASS } from '@/components/ui/eyebrow';
import { useResumeImport } from '../../hooks/use-resume-import';
import type { ResumeWorkspace } from '../../hooks/use-resume-workspace';
import type { Account } from '../../resume-draft';
import { AiComingSoon } from '../ai-coming-soon';
import { AiConsent } from '../ai-consent';
import { PanelFrame } from '../panel-frame';

function Source({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-t border-border pt-4">
      <h3 className={EYEBROW_CLASS}>{title}</h3>
      <p className="text-[13px] text-muted-foreground">{hint}</p>
      {children}
    </section>
  );
}

const LINKEDIN_HINT =
  'On LinkedIn: Settings, Data privacy, Get a copy of your data. Upload the .zip they email you; we read only your profile, positions, education, skills, certifications, languages, projects, honours and publications.';

/** A file input's change handler that passes on the chosen file and clears the input. */
const picked =
  (handle: (file: File) => Promise<void>) => (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file !== undefined) void handle(file);
  };

type AiSourceProps = {
  aiAvailable: boolean;
  pending: boolean;
  onFile: (file: File) => Promise<void>;
};

function AiSource({ aiAvailable, pending, onFile }: AiSourceProps) {
  const [agreed, setAgreed] = useState(false);
  return (
    <Source title="PDF or Word CV" hint="Reads an existing CV into the builder's sections.">
      {aiAvailable ? (
        <>
          <AiConsent
            feature="resumeImport"
            agreed={agreed}
            onAgreed={setAgreed}
            disabled={pending}
          />
          <FileInput
            accept=".pdf,.docx"
            disabled={!agreed || pending}
            onChange={picked(onFile)}
            aria-label="CV to import (PDF or Word)"
          />
        </>
      ) : (
        <AiComingSoon feature="Importing a PDF or Word CV" />
      )}
    </Source>
  );
}

type ImportPanelProps = { workspace: ResumeWorkspace; account: Account; aiAvailable: boolean };

/** Start a new resume from a JSON Resume file, a LinkedIn export, or (with AI) a PDF or Word CV. */
export function ImportPanel({ workspace, account, aiAvailable }: ImportPanelProps) {
  const { pending, done, problem, fromJson, fromServer } = useResumeImport(workspace, account);
  return (
    <PanelFrame
      title="Import"
      description="Each import becomes a new resume; the one you are editing stays as it is."
    >
      <Source
        title="JSON Resume"
        hint="A .json file from another resume tool, or one you downloaded here as a backup."
      >
        <FileInput
          accept=".json,application/json"
          disabled={pending}
          onChange={picked(fromJson)}
          aria-label="JSON Resume file"
        />
      </Source>
      <Source title="LinkedIn" hint={LINKEDIN_HINT}>
        <FileInput
          accept=".zip,application/zip"
          disabled={pending}
          onChange={picked((file) => fromServer(API_ROUTES.resumeImportLinkedIn, file))}
          aria-label="LinkedIn export (.zip)"
        />
      </Source>
      <AiSource
        aiAvailable={aiAvailable}
        pending={pending}
        onFile={(file) =>
          fromServer(API_ROUTES.resumeImportAi, file, { consentedNotice: AI_NOTICE_VERSION })
        }
      />
      {pending && <p className="text-sm">Importing…</p>}
      {done !== null && <p className="text-sm">{done}</p>}
      <FormError message={problem} />
    </PanelFrame>
  );
}
