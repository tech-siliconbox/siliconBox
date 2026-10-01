import 'server-only';
import { type Resume, formatResumePeriod } from '@siliconbox/shared';
import { Document, Page, Text, View } from '@react-pdf/renderer';
import type { ReactNode } from 'react';
import { type ResumeStyles, resumeStyles } from './styles';

type Styled = { styles: ResumeStyles };

function Section({ title, styles, children }: Styled & { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.heading}>{title}</Text>
      {children}
    </View>
  );
}

function Bullets({ items, styles }: Styled & { items: string[] }) {
  return items.map((item, index) => (
    <View key={index} style={styles.bullet}>
      <Text style={styles.bulletMark}>•</Text>
      <Text style={styles.bulletText}>{item}</Text>
    </View>
  ));
}

function Entry({
  title,
  right,
  subtitle,
  bullets,
  styles,
}: Styled & { title: string; right: string; subtitle?: string; bullets?: string[] }) {
  return (
    <View style={styles.entry} wrap={false}>
      <View style={styles.row}>
        <Text style={styles.strong}>{title}</Text>
        <Text style={styles.muted}>{right}</Text>
      </View>
      {subtitle !== undefined && subtitle !== '' && <Text style={styles.muted}>{subtitle}</Text>}
      {bullets !== undefined && <Bullets items={bullets} styles={styles} />}
    </View>
  );
}

function Header({ basics, styles }: Styled & { basics: Resume['basics'] }) {
  const contact = [
    basics.email,
    basics.phone,
    basics.location,
    ...basics.links.map((link) => link.url),
  ].filter(Boolean);
  return (
    <View>
      <Text style={styles.name}>{basics.fullName}</Text>
      {basics.headline !== '' && <Text style={styles.headline}>{basics.headline}</Text>}
      <Text style={styles.contact}>{contact.join('  |  ')}</Text>
    </View>
  );
}

function Body({ resume, styles }: Styled & { resume: Resume }) {
  return (
    <>
      {resume.summary !== '' && (
        <Section title="Summary" styles={styles}>
          <Text>{resume.summary}</Text>
        </Section>
      )}
      {resume.skills.length > 0 && (
        <Section title="Skills" styles={styles}>
          {resume.skills.map((skill) => (
            <Text key={skill.category}>
              <Text style={styles.strong}>{skill.category}: </Text>
              {skill.items.join(', ')}
            </Text>
          ))}
        </Section>
      )}
      {resume.experience.length > 0 && (
        <Section title="Experience" styles={styles}>
          {resume.experience.map((job, index) => (
            <Entry
              key={index}
              title={`${job.role}, ${job.company}`}
              right={formatResumePeriod(job.start, job.end)}
              subtitle={job.location}
              bullets={job.bullets}
              styles={styles}
            />
          ))}
        </Section>
      )}
      {resume.projects.length > 0 && (
        <Section title="Projects" styles={styles}>
          {resume.projects.map((project, index) => (
            <Entry
              key={index}
              title={project.name}
              right={project.link}
              bullets={project.bullets}
              styles={styles}
            />
          ))}
        </Section>
      )}
      <Footer resume={resume} styles={styles} />
    </>
  );
}

function Footer({ resume, styles }: Styled & { resume: Resume }) {
  return (
    <>
      {resume.education.length > 0 && (
        <Section title="Education" styles={styles}>
          {resume.education.map((school, index) => (
            <Entry
              key={index}
              title={school.degree}
              right={formatResumePeriod(school.start, school.end)}
              subtitle={[school.institution, school.score].filter(Boolean).join(' · ')}
              styles={styles}
            />
          ))}
        </Section>
      )}
      {resume.certifications.length > 0 && (
        <Section title="Certifications" styles={styles}>
          {resume.certifications.map((cert, index) => (
            <Entry
              key={index}
              title={cert.name}
              right={String(cert.year)}
              subtitle={cert.issuer}
              styles={styles}
            />
          ))}
        </Section>
      )}
    </>
  );
}

/** The resume as an A4, single-column, text-based PDF that applicant tracking systems can parse. */
export function ResumeDocument({ resume }: { resume: Resume }) {
  const styles = resumeStyles(resume.template);
  return (
    <Document
      title={`${resume.basics.fullName} - Resume`}
      author={resume.basics.fullName}
      creator="SiliconBox"
      producer="SiliconBox"
    >
      <Page size="A4" style={styles.page}>
        <Header basics={resume.basics} styles={styles} />
        <Body resume={resume} styles={styles} />
      </Page>
    </Document>
  );
}
