import type { RESUME_MARGINS, RESUME_SPACINGS, RESUME_TEMPLATES } from '../schemas/resume';

// How each template and design setting looks, read by the preview, the PDF and the Word file so
// all three agree. Every template is one column with text headings, which ATS read in order.

type TemplateStyle = {
  align: 'left' | 'center';
  uppercaseHeadings: boolean;
  /** A line under each heading. */
  rule: boolean;
  /** The name in the accent colour (headings always are). */
  accentName: boolean;
  /** The name's size as a multiple of the body text. */
  nameScale: number;
};

export const RESUME_TEMPLATE_STYLES: Readonly<
  Record<(typeof RESUME_TEMPLATES)[number], TemplateStyle>
> = {
  classic: {
    align: 'center',
    uppercaseHeadings: true,
    rule: true,
    accentName: false,
    nameScale: 2,
  },
  compact: {
    align: 'left',
    uppercaseHeadings: true,
    rule: true,
    accentName: false,
    nameScale: 1.6,
  },
  modern: { align: 'left', uppercaseHeadings: false, rule: true, accentName: true, nameScale: 2.1 },
  minimal: {
    align: 'left',
    uppercaseHeadings: true,
    rule: false,
    accentName: false,
    nameScale: 1.8,
  },
};

/** Gaps between sections and entries, as a multiple of the normal gap. */
export const RESUME_SPACING_SCALE: Readonly<Record<(typeof RESUME_SPACINGS)[number], number>> = {
  compact: 0.7,
  normal: 1,
  relaxed: 1.35,
};

/** Page margins in points: top and bottom, then left and right. */
export const RESUME_MARGIN_POINTS: Readonly<
  Record<(typeof RESUME_MARGINS)[number], readonly [number, number]>
> = {
  narrow: [24, 30],
  normal: [36, 42],
  wide: [50, 58],
};
