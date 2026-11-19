import type { Resume } from '../schemas/resume';
import { type ResumeBlock, resumeDocument } from './document';

// The resume as Markdown, for a README, a portfolio or plain-text applications. Bullets and the
// summary are already in Markdown's **bold** and *italic*.

function blockLines(block: ResumeBlock): string[] {
  if (block.kind === 'text') return [block.text];
  if (block.kind === 'lines')
    return block.lines.map(({ label, text }) => `- **${label}:** ${text}`);
  return block.entries.flatMap((entry) => [
    `### ${entry.title}${entry.meta === '' ? '' : ` (${entry.meta})`}`,
    ...(entry.subtitle === '' ? [] : [entry.subtitle]),
    ...(entry.description === '' ? [] : [entry.description]),
    ...entry.bullets.map((bullet) => `- ${bullet}`),
    '',
  ]);
}

export function resumeMarkdown(resume: Resume): string {
  const document = resumeDocument(resume);
  const lines = [
    `# ${document.name}`,
    ...(document.headline === '' ? [] : [document.headline]),
    '',
    document.contact.join(' · '),
    ...document.blocks.flatMap((block) => ['', `## ${block.heading}`, '', ...blockLines(block)]),
  ];
  return `${lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()}\n`;
}
