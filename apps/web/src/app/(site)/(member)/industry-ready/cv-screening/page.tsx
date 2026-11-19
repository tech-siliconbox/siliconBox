import type { Metadata } from 'next';
import { Eyebrow } from '@/components/ui/eyebrow';
import { listScreenings } from '@/db/cv-screenings';
import { CareerToolLocked } from '@/features/industry-ready/components/career-tool-locked';
import { CvScreener } from '@/features/industry-ready/components/cv/cv-screener';
import { isAiConfigured } from '@/server/ai/claude';
import { requirePageIdentity } from '@/server/auth/page-identity';
import { CAREER_SERVICES, careerToolState } from '@/server/career-services';
import { PAGE_SPACING } from '@/components/shared/page-shell';

export const metadata: Metadata = {
  title: 'CV screening',
  robots: { index: false, follow: false },
};

export default async function CvScreeningPage() {
  const identity = await requirePageIdentity();
  const state = await careerToolState(identity, CAREER_SERVICES.cvScreening);
  if (state !== 'open') return <CareerToolLocked title="CV screening" reason={state} />;
  const screenings = await listScreenings(identity.userId);
  return (
    <div className={`mx-auto flex max-w-3xl flex-col gap-6 px-6 ${PAGE_SPACING}`}>
      <header className="flex flex-col gap-2 text-center">
        <Eyebrow>Industry Ready</Eyebrow>
        <h1 className="text-4xl font-bold tracking-tighter">CV screening</h1>
        <p className="text-sm text-muted-foreground">
          See your CV the way an applicant tracking system and a formal verification recruiter
          would. Your CV is kept under your account, with its report, until you delete it.
        </p>
      </header>
      <CvScreener initial={screenings} aiAvailable={isAiConfigured()} />
    </div>
  );
}
