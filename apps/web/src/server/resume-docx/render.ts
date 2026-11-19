import 'server-only';
import {
  type InlineNode,
  RESUME_ACCENTS,
  RESUME_MARGIN_POINTS,
  RESUME_SPACING_SCALE,
  RESUME_TEMPLATE_STYLES,
  type Resume,
  type ResumeBlock,
  type ResumeEntry,
  parseInlineText,
  resumeDocument,
} from '@siliconbox/shared';
import {
  AlignmentType,
  BorderStyle,
  Document,
  LevelFormat,
  Packer,
  Paragraph,
  Tab,
  TabStopType,
  TextRun,
} from 'docx';

// The resume as a Word file: the same sections as the PDF, one column, real headings and bullet
// lists, so recruiters can edit it and applicant tracking systems read it in order.

const FONTS = { sans: 'Arial', serif: 'Times New Roman' } as const;
const PAGES = { A4: { width: 11906, height: 16838 }, LETTER: { width: 12240, height: 15840 } };
const BULLETS = 'resume-bullets';
const MUTED = '3F3F46';
/** Word measures in twentieths of a point, and text size in half-points. */
const twips = (points: number) => Math.round(points * 20);
const halfPoints = (points: number) => Math.round(points * 2);

type Context = { resume: Resume; contentWidth: number; gap: number };

function runsOf(nodes: InlineNode[], bold = false, italics = false): TextRun[] {
  return nodes.flatMap((node) =>
    node.kind === 'text' || node.kind === 'code'
      ? [new TextRun({ text: node.text, bold, italics })]
      : runsOf(node.children, bold || node.kind === 'strong', italics || node.kind === 'em'),
  );
}

const rich = (text: string) => runsOf(parseInlineText(text));

function header(resume: Resume): Paragraph[] {
  const model = resumeDocument(resume);
  const look = RESUME_TEMPLATE_STYLES[resume.template];
  const alignment = look.align === 'center' ? AlignmentType.CENTER : AlignmentType.LEFT;
  const accent = RESUME_ACCENTS[resume.design.accent].slice(1);
  const name = new TextRun({
    text: model.name,
    bold: true,
    size: halfPoints(resume.design.fontSize * look.nameScale),
    ...(look.accentName ? { color: accent } : {}),
  });
  return [
    new Paragraph({ alignment, children: [name] }),
    ...(model.headline === '' ? [] : [new Paragraph({ alignment, text: model.headline })]),
    new Paragraph({
      alignment,
      children: [new TextRun({ text: model.contact.join('  |  '), color: MUTED })],
    }),
  ];
}

function heading(text: string, { resume, gap }: Context): Paragraph {
  const look = RESUME_TEMPLATE_STYLES[resume.template];
  const color = RESUME_ACCENTS[resume.design.accent].slice(1);
  return new Paragraph({
    spacing: { before: twips(10 * gap), after: twips(4 * gap) },
    keepNext: true,
    ...(look.rule
      ? { border: { bottom: { style: BorderStyle.SINGLE, size: 6, color, space: 1 } } }
      : {}),
    children: [
      new TextRun({
        text,
        bold: true,
        color,
        allCaps: look.uppercaseHeadings,
        size: halfPoints(resume.design.fontSize + 0.5),
      }),
    ],
  });
}

function entryParagraphs(entry: ResumeEntry, { contentWidth, gap }: Context): Paragraph[] {
  const muted = (text: string) =>
    new Paragraph({ children: [new TextRun({ text, color: MUTED })] });
  return [
    new Paragraph({
      keepNext: true,
      spacing: { before: twips(4 * gap) },
      tabStops: [{ type: TabStopType.RIGHT, position: contentWidth }],
      children: [
        new TextRun({ text: entry.title, bold: true }),
        new TextRun({ children: [new Tab(), entry.meta], color: MUTED }),
      ],
    }),
    ...(entry.subtitle === '' ? [] : [muted(entry.subtitle)]),
    ...(entry.description === '' ? [] : [new Paragraph({ children: rich(entry.description) })]),
    ...entry.bullets.map(
      (bullet) =>
        new Paragraph({ numbering: { reference: BULLETS, level: 0 }, children: rich(bullet) }),
    ),
  ];
}

function blockParagraphs(block: ResumeBlock, context: Context): Paragraph[] {
  const body =
    block.kind === 'text'
      ? [new Paragraph({ children: rich(block.text) })]
      : block.kind === 'lines'
        ? block.lines.map(
            ({ label, text }) =>
              new Paragraph({
                children: [new TextRun({ text: `${label}: `, bold: true }), new TextRun(text)],
              }),
          )
        : block.entries.flatMap((entry) => entryParagraphs(entry, context));
  return [heading(block.heading, context), ...body];
}

const BULLET_NUMBERING = {
  config: [
    {
      reference: BULLETS,
      levels: [
        {
          level: 0,
          format: LevelFormat.BULLET,
          text: '\u2022',
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 360, hanging: 240 } } },
        },
      ],
    },
  ],
};

/** The page size and margins of the chosen paper and margin setting, in Word's units. */
function pageOf({ design }: Resume) {
  const size = PAGES[design.pageSize];
  const [marginY, marginX] = RESUME_MARGIN_POINTS[design.margins];
  const [y, x] = [twips(marginY), twips(marginX)];
  return {
    size,
    margin: { top: y, bottom: y, left: x, right: x },
    contentWidth: size.width - 2 * x,
  };
}

/** The resume as a .docx file. */
export function renderResumeDocx(resume: Resume): Promise<Buffer> {
  const page = pageOf(resume);
  const context: Context = {
    resume,
    contentWidth: page.contentWidth,
    gap: RESUME_SPACING_SCALE[resume.design.spacing],
  };
  const model = resumeDocument(resume);
  const document = new Document({
    creator: 'SiliconBox',
    title: `${model.name} - Resume`,
    styles: {
      default: {
        document: {
          run: { font: FONTS[resume.design.font], size: halfPoints(resume.design.fontSize) },
          paragraph: { spacing: { line: 276 } },
        },
      },
    },
    numbering: BULLET_NUMBERING,
    sections: [
      {
        properties: { page: { size: page.size, margin: page.margin } },
        children: [
          ...header(resume),
          ...model.blocks.flatMap((block) => blockParagraphs(block, context)),
        ],
      },
    ],
  });
  return Packer.toBuffer(document);
}
