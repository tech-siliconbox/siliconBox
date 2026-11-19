'use client';

import { type TailorProposal, type Tailoring, applyProposal } from '@siliconbox/shared';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EYEBROW_CLASS } from '@/components/ui/eyebrow';
import { FormError } from '@/components/ui/form-error';
import { useResumeTailor } from '../../hooks/use-resume-tailor';
import type { ResumeWorkspace } from '../../hooks/use-resume-workspace';
import { AiComingSoon } from '../ai-coming-soon';
import { AiConsent } from '../ai-consent';
import { JobDescriptionField } from '../cv/job-description-field';
import { PanelFrame } from '../panel-frame';

const KIND_LABEL = { summary: 'Summary', bullet: 'Bullet', skill: 'Add skill' } as const;

function Proposal({
  proposal,
  onAccept,
  onDismiss,
}: {
  proposal: TailorProposal;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  return (
    <li className="flex flex-col gap-2 rounded-md border border-border p-4 text-sm">
      <p className="flex items-center gap-2">
        <Badge>{KIND_LABEL[proposal.kind]}</Badge>
        <span className="text-muted-foreground">{proposal.reason}</span>
      </p>
      {proposal.kind === 'skill' ? (
        <p className="font-semibold">{proposal.skill}</p>
      ) : (
        <>
          {proposal.before !== '' && (
            <p className="border-l-2 border-border pl-3 text-muted-foreground">
              Now: {proposal.before}
            </p>
          )}
          <p className="border-l-2 border-foreground pl-3">Suggested: {proposal.after}</p>
        </>
      )}
      <div className="flex gap-2">
        <Button size="sm" onClick={onAccept}>
          Accept
        </Button>
        <Button size="sm" variant="secondary" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </li>
  );
}

function Gaps({ gaps }: { gaps: Tailoring['gaps'] }) {
  if (gaps.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <h3 className={EYEBROW_CLASS}>The job asks for, your resume does not show</h3>
      <ul className="flex flex-col gap-1 text-sm">
        {gaps.map((gap) => (
          <li key={gap.need}>
            <strong className="font-semibold">{gap.need}.</strong>{' '}
            <span className="text-muted-foreground">{gap.advice}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TailorWithAi({ workspace }: { workspace: ResumeWorkspace }) {
  const [jobDescription, setJobDescription] = useState('');
  const [agreed, setAgreed] = useState(false);
  const { pending, error, tailoring, suggest, handled } = useResumeTailor();
  const { editor } = workspace;

  async function run() {
    const publicId = await workspace.settle();
    if (publicId !== null) await suggest(publicId, jobDescription.trim());
  }
  const accept = (proposal: TailorProposal) => {
    editor.update(applyProposal(editor.draft.resume, proposal));
    handled(proposal);
  };

  return (
    <>
      <JobDescriptionField value={jobDescription} onChange={setJobDescription} disabled={pending} />
      <AiConsent feature="resumeTailor" agreed={agreed} onAgreed={setAgreed} disabled={pending} />
      <Button
        className="w-fit"
        disabled={!agreed || pending || jobDescription.trim() === ''}
        onClick={() => void run()}
      >
        {pending ? 'Reading the job… up to a minute' : 'Suggest changes'}
      </Button>
      <FormError message={error} />
      {tailoring !== null && (
        <>
          <ol className="flex flex-col gap-3">
            {tailoring.proposals.map((proposal, index) => (
              <Proposal
                key={index}
                proposal={proposal}
                onAccept={() => accept(proposal)}
                onDismiss={() => handled(proposal)}
              />
            ))}
          </ol>
          <Gaps gaps={tailoring.gaps} />
        </>
      )}
    </>
  );
}

type TailorPanelProps = { workspace: ResumeWorkspace; aiAvailable: boolean };

/** Proposals that fit this resume to one job, each accepted or dismissed by the learner. */
export function TailorPanel({ workspace, aiAvailable }: TailorPanelProps) {
  return (
    <PanelFrame
      title="Tailor to a job"
      description="Paste a job description; AI suggests rewrites from what your resume already says and names what the job asks for that it does not show. Nothing changes until you accept."
    >
      {aiAvailable ? (
        <TailorWithAi workspace={workspace} />
      ) : (
        <AiComingSoon feature="Tailoring your resume to a job" />
      )}
    </PanelFrame>
  );
}
