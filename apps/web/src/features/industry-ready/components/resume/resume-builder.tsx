'use client';

import { API_ROUTES, type Resume, emptyResume } from '@siliconbox/shared';
import type { ReactNode } from 'react';
import { TextAreaField } from '@/components/ui/text-area-field';
import { useResumeDraft } from '../../hooks/use-resume-draft';
import { BasicsEditor } from './basics-editor';
import { CertificationsEditor } from './certifications-editor';
import { EducationEditor } from './education-editor';
import { ExperienceEditor } from './experience-editor';
import { ProjectsEditor } from './projects-editor';
import { ResumePreview } from './resume-preview';
import { ResumeToolbar } from './resume-toolbar';
import { SkillsEditor } from './skills-editor';

function EditorSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-b border-border pb-6">
      <h2 className="text-base font-bold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

/** Editor on the left, live preview on the right; the PDF is built on the server from the saved resume. */
export function ResumeBuilder({ initial }: { initial: Resume }) {
  const { resume, update, save, status, problem } = useResumeDraft(initial);
  const set = (patch: Partial<Resume>) => update({ ...resume, ...patch });

  async function download() {
    if (status !== 'saved' && !(await save())) return;
    window.location.assign(API_ROUTES.resumePdf);
  }

  async function remove() {
    if (!window.confirm('Delete your saved resume? This cannot be undone.')) return;
    const response = await fetch(API_ROUTES.resume, { method: 'DELETE' }).catch(() => null);
    if (response?.ok === true) update(emptyResume(resume.basics.fullName, resume.basics.email));
  }

  return (
    <div className="flex flex-col gap-6">
      <ResumeToolbar
        template={resume.template}
        status={status}
        onTemplate={(template) => set({ template })}
        onSave={() => void save()}
        onDownload={() => void download()}
        onDelete={() => void remove()}
      />
      {problem !== null && (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      )}
      <div className="grid gap-8 lg:grid-cols-[1fr_minmax(0,480px)]">
        <ResumeSections resume={resume} set={set} />
        <div className="lg:sticky lg:top-[120px] lg:self-start">
          <ResumePreview resume={resume} />
        </div>
      </div>
    </div>
  );
}

type SectionsProps = { resume: Resume; set: (patch: Partial<Resume>) => void };

function ResumeSections({ resume, set }: SectionsProps) {
  return (
    <div className="flex flex-col gap-6">
      <EditorSection title="Contact">
        <BasicsEditor basics={resume.basics} onChange={(basics) => set({ basics })} />
      </EditorSection>
      <EditorSection title="Summary">
        <TextAreaField
          label="Two or three lines on what you verify and how"
          value={resume.summary}
          maxLength={800}
          onChange={(e) => set({ summary: e.target.value })}
        />
      </EditorSection>
      <EditorSection title="Skills">
        <SkillsEditor skills={resume.skills} onChange={(skills) => set({ skills })} />
      </EditorSection>
      <EditorSection title="Experience">
        <ExperienceEditor
          items={resume.experience}
          onChange={(experience) => set({ experience })}
        />
      </EditorSection>
      <EditorSection title="Projects">
        <ProjectsEditor items={resume.projects} onChange={(projects) => set({ projects })} />
      </EditorSection>
      <EditorSection title="Education">
        <EducationEditor items={resume.education} onChange={(education) => set({ education })} />
      </EditorSection>
      <EditorSection title="Certifications">
        <CertificationsEditor
          items={resume.certifications}
          onChange={(certifications) => set({ certifications })}
        />
      </EditorSection>
    </div>
  );
}
