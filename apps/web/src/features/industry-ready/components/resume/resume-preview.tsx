'use client';

import { type Resume, formatResumePeriod } from '@siliconbox/shared';
import type { ReactNode } from 'react';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-3">
      <h3 className="mb-1 border-b border-foreground pb-0.5 text-[11px] font-bold uppercase tracking-wider">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Entry({
  title,
  right,
  subtitle,
  bullets,
}: {
  title: string;
  right: string;
  subtitle?: string;
  bullets?: string[];
}) {
  return (
    <div className="mb-1.5">
      <div className="flex justify-between gap-2">
        <span className="font-semibold">{title}</span>
        <span className="text-muted-foreground">{right}</span>
      </div>
      {subtitle !== undefined && subtitle !== '' && (
        <p className="text-muted-foreground">{subtitle}</p>
      )}
      {bullets !== undefined && (
        <ul className="ml-3 list-disc">
          {bullets
            .filter((b) => b.trim() !== '')
            .map((bullet, index) => (
              <li key={index}>{bullet}</li>
            ))}
        </ul>
      )}
    </div>
  );
}

/** An on-screen approximation of the PDF, updated as the learner types. */
export function ResumePreview({ resume }: { resume: Resume }) {
  return (
    <article
      aria-label="Resume preview"
      className="rounded-md border border-border bg-background p-6 text-[11px] leading-snug"
    >
      <PreviewHeader basics={resume.basics} centered={resume.template === 'classic'} />
      <PreviewMain resume={resume} />
      <PreviewRest resume={resume} />
    </article>
  );
}

function PreviewHeader({ basics, centered }: { basics: Resume['basics']; centered: boolean }) {
  const contact = [
    basics.email,
    basics.phone,
    basics.location,
    ...basics.links.map((link) => link.url),
  ].filter(Boolean);
  return (
    <header className={centered ? 'text-center' : ''}>
      <h2 className="text-xl font-bold">{basics.fullName}</h2>
      {basics.headline !== '' && <p>{basics.headline}</p>}
      <p className="mt-1 text-muted-foreground">{contact.join('  |  ')}</p>
    </header>
  );
}

function PreviewMain({ resume }: { resume: Resume }) {
  return (
    <>
      {resume.summary !== '' && (
        <Section title="Summary">
          <p>{resume.summary}</p>
        </Section>
      )}
      {resume.skills.length > 0 && (
        <Section title="Skills">
          {resume.skills.map((skill) => (
            <p key={skill.category}>
              <strong>{skill.category}:</strong> {skill.items.join(', ')}
            </p>
          ))}
        </Section>
      )}
      {resume.experience.length > 0 && (
        <Section title="Experience">
          {resume.experience.map((job, i) => (
            <Entry
              key={i}
              title={`${job.role}, ${job.company}`}
              right={formatResumePeriod(job.start, job.end)}
              subtitle={job.location}
              bullets={job.bullets}
            />
          ))}
        </Section>
      )}
    </>
  );
}

function PreviewRest({ resume }: { resume: Resume }) {
  return (
    <>
      {resume.projects.length > 0 && (
        <Section title="Projects">
          {resume.projects.map((p, i) => (
            <Entry key={i} title={p.name} right={p.link} bullets={p.bullets} />
          ))}
        </Section>
      )}
      {resume.education.length > 0 && (
        <Section title="Education">
          {resume.education.map((s, i) => (
            <Entry
              key={i}
              title={s.degree}
              right={formatResumePeriod(s.start, s.end)}
              subtitle={[s.institution, s.score].filter(Boolean).join(' · ')}
            />
          ))}
        </Section>
      )}
      {resume.certifications.length > 0 && (
        <Section title="Certifications">
          {resume.certifications.map((c, i) => (
            <Entry key={i} title={c.name} right={String(c.year)} subtitle={c.issuer} />
          ))}
        </Section>
      )}
    </>
  );
}
