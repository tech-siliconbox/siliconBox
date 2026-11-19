import type { ResumeAccent, ResumeDesign } from '@siliconbox/shared';

// The preview's classes for each design setting. The strict CSP forbids style attributes, so
// colours and sizes are classes written out here (Tailwind keeps only classes it can see); a test
// keeps each colour equal to the PDF's (RESUME_ACCENTS).

export const ACCENT_CLASSES: Readonly<
  Record<ResumeAccent, { text: string; border: string; fill: string }>
> = {
  black: { text: 'text-[#121212]', border: 'border-[#121212]', fill: 'fill-[#121212]' },
  navy: { text: 'text-[#1e3a5f]', border: 'border-[#1e3a5f]', fill: 'fill-[#1e3a5f]' },
  teal: { text: 'text-[#0f5e5a]', border: 'border-[#0f5e5a]', fill: 'fill-[#0f5e5a]' },
  burgundy: { text: 'text-[#7a1f2b]', border: 'border-[#7a1f2b]', fill: 'fill-[#7a1f2b]' },
  forest: { text: 'text-[#2f5233]', border: 'border-[#2f5233]', fill: 'fill-[#2f5233]' },
  slate: { text: 'text-[#3f4b5b]', border: 'border-[#3f4b5b]', fill: 'fill-[#3f4b5b]' },
};

/** Body text a little larger than the points on paper, as the preview is narrower than a page. */
export const FONT_SIZE_CLASSES: Readonly<Record<ResumeDesign['fontSize'], string>> = {
  9: 'text-[10px]',
  9.5: 'text-[10.5px]',
  10: 'text-[11px]',
  10.5: 'text-[11.5px]',
  11: 'text-[12px]',
  11.5: 'text-[12.5px]',
  12: 'text-[13px]',
};

export const FONT_CLASSES: Readonly<Record<ResumeDesign['font'], string>> = {
  sans: 'font-sans',
  serif: 'font-serif',
};

export const SECTION_GAP_CLASSES: Readonly<Record<ResumeDesign['spacing'], string>> = {
  compact: 'mt-2',
  normal: 'mt-3',
  relaxed: 'mt-4',
};

export const PAGE_PADDING_CLASSES: Readonly<Record<ResumeDesign['margins'], string>> = {
  narrow: 'p-4',
  normal: 'p-6',
  wide: 'p-8',
};
