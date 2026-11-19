import type { Metadata } from 'next';
import { Eyebrow } from '@/components/ui/eyebrow';
import { findLatestResume, listResumes } from '@/db/resumes';
import { CareerToolLocked } from '@/features/industry-ready/components/career-tool-locked';
import { ResumeBuilder } from '@/features/industry-ready/components/resume/resume-builder';
import { blankDraft } from '@/features/industry-ready/hooks/use-resume-workspace';
import { isAiConfigured } from '@/server/ai/claude';
import { requirePageIdentity } from '@/server/auth/page-identity';
import { CAREER_SERVICES, careerToolState } from '@/server/career-services';

export const metadata: Metadata = {
  title: 'Resume Builder',
  robots: { index: false, follow: false },
};

export default async function ResumeBuilderPage() {
  const identity = await requirePageIdentity();
  const state = await careerToolState(identity, CAREER_SERVICES.resumeBuilder);
  if (state !== 'open') return <CareerToolLocked title="Resume Builder" reason={state} />;
  const account = { name: identity.name, email: identity.email };
  const [list, latest] = await Promise.all([
    listResumes(identity.userId),
    findLatestResume(identity.userId),
  ]);
  const initial =
    latest === null
      ? blankDraft(account)
      : { publicId: latest.publicId, title: latest.title, resume: latest.resume };
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 pb-20 pt-12">
      <header className="flex flex-col gap-2">
        <Eyebrow>Industry Ready</Eyebrow>
        <h1 className="text-4xl font-bold tracking-tighter">Resume Builder</h1>
        <p className="text-sm text-muted-foreground">
          One column, real text and standard headings, so applicant tracking systems read it
          correctly. Keep a resume for each kind of role; it saves as you type.
        </p>
      </header>
      <ResumeBuilder
        list={list}
        initial={initial}
        account={account}
        aiAvailable={isAiConfigured()}
      />
    </div>
  );
}
