'use client';

import type { Resume, ResumeSummary } from '@siliconbox/shared';
import { type ReactNode, useId, useState } from 'react';
import { FormError } from '@/components/ui/form-error';
import { TextAreaField } from '@/components/ui/text-area-field';
import type { ResumeDraft } from '../../hooks/use-resume-draft';
import {
  type Account,
  type ResumeWorkspace,
  useResumeWorkspace,
} from '../../hooks/use-resume-workspace';
import { AwardsEditor } from './awards-editor';
import { BasicsEditor } from './basics-editor';
import { CertificationsEditor } from './certifications-editor';
import { CustomSectionEditor } from './custom-section-editor';
import { DesignPanel } from './design-panel';
import { EducationEditor } from './education-editor';
import { ExperienceEditor } from './experience-editor';
import { ImportPanel } from './import-panel';
import { LanguagesEditor } from './languages-editor';
import { ProjectsEditor } from './projects-editor';
import { PublicationsEditor } from './publications-editor';
import { ResumeCheckPanel } from './resume-check-panel';
import { ResumeLibraryBar } from './resume-library-bar';
import { ResumePreview } from './resume-preview';
import { type PanelName, ResumeToolbar } from './resume-toolbar';
import { SectionsPanel } from './sections-panel';
import { SkillsEditor } from './skills-editor';
import { TailorPanel } from './tailor-panel';

function EditorSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-b border-border pb-6">
      <h2 className="text-base font-bold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

type SectionsProps = { resume: Resume; set: (patch: Partial<Resume>) => void };

function MainSections({ resume, set }: SectionsProps) {
  return (
    <>
      <EditorSection title="Contact">
        <BasicsEditor basics={resume.basics} onChange={(basics) => set({ basics })} />
      </EditorSection>
      <EditorSection title="Summary">
        <TextAreaField
          label="Two or three lines on what you verify and how (**bold** for emphasis)"
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
    </>
  );
}

function MoreSections({ resume, set }: SectionsProps) {
  const setCustom = (id: string, items: Resume['custom'][number]['items']) =>
    set({
      custom: resume.custom.map((section) => (section.id === id ? { ...section, items } : section)),
    });
  return (
    <>
      <EditorSection title="Certifications">
        <CertificationsEditor
          items={resume.certifications}
          onChange={(certifications) => set({ certifications })}
        />
      </EditorSection>
      <EditorSection title="Awards and achievements">
        <AwardsEditor items={resume.awards} onChange={(awards) => set({ awards })} />
      </EditorSection>
      <EditorSection title="Publications">
        <PublicationsEditor
          items={resume.publications}
          onChange={(publications) => set({ publications })}
        />
      </EditorSection>
      <EditorSection title="Languages">
        <LanguagesEditor items={resume.languages} onChange={(languages) => set({ languages })} />
      </EditorSection>
      {resume.custom.map((section) => (
        <EditorSection key={section.id} title={section.title || 'Your section'}>
          <CustomSectionEditor
            items={section.items}
            onChange={(items) => setCustom(section.id, items)}
          />
        </EditorSection>
      ))}
      <p className="text-[13px] text-muted-foreground">
        Empty sections are left out of the resume. Use Sections to reorder, rename, hide or add your
        own.
      </p>
    </>
  );
}

type PanelProps = {
  name: PanelName;
  workspace: ResumeWorkspace;
  account: Account;
  aiAvailable: boolean;
};

function OpenPanel({ name, workspace, account, aiAvailable }: PanelProps) {
  const { editor } = workspace;
  switch (name) {
    case 'sections':
      return <SectionsPanel resume={editor.draft.resume} onChange={editor.update} />;
    case 'design':
      return <DesignPanel resume={editor.draft.resume} onChange={editor.update} />;
    case 'check':
      return <ResumeCheckPanel settle={workspace.settle} />;
    case 'import':
      return <ImportPanel workspace={workspace} account={account} aiAvailable={aiAvailable} />;
    case 'tailor':
      return <TailorPanel workspace={workspace} aiAvailable={aiAvailable} />;
  }
}

type ResumeBuilderProps = {
  list: ResumeSummary[];
  initial: ResumeDraft;
  account: Account;
  aiAvailable: boolean;
};

/**
 * The learner's resumes: editor on the left, live preview on the right, and the toolbar's panels.
 * PDF, Word and the check are built on the server from the saved resume; it saves as you type.
 */
export function ResumeBuilder({ list, initial, account, aiAvailable }: ResumeBuilderProps) {
  const workspace = useResumeWorkspace({ list, draft: initial, account });
  const { editor } = workspace;
  const [panel, setPanel] = useState<PanelName | null>(null);
  const panelId = useId();
  const set = (patch: Partial<Resume>) => editor.update({ ...editor.draft.resume, ...patch });
  return (
    <div className="flex flex-col gap-6">
      <ResumeLibraryBar workspace={workspace} />
      <ResumeToolbar
        workspace={workspace}
        panel={panel}
        panelId={panelId}
        onPanel={(name) => setPanel(panel === name ? null : name)}
      />
      <FormError message={editor.problem ?? workspace.error} />
      <div id={panelId}>
        {panel !== null && (
          <OpenPanel
            name={panel}
            workspace={workspace}
            account={account}
            aiAvailable={aiAvailable}
          />
        )}
      </div>
      <div className="grid gap-8 lg:grid-cols-[1fr_minmax(0,480px)]">
        <div className="flex flex-col gap-6">
          <MainSections resume={editor.draft.resume} set={set} />
          <MoreSections resume={editor.draft.resume} set={set} />
        </div>
        <div className="lg:sticky lg:top-[120px] lg:self-start">
          <ResumePreview resume={editor.draft.resume} />
        </div>
      </div>
    </div>
  );
}
