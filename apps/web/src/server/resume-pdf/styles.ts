import 'server-only';
import {
  RESUME_ACCENTS,
  RESUME_MARGIN_POINTS,
  RESUME_SPACING_SCALE,
  RESUME_TEMPLATE_STYLES,
  type Resume,
} from '@siliconbox/shared';
import { StyleSheet } from '@react-pdf/renderer';

// The PDF's built-in fonts: every ATS extracts them cleanly and nothing has to be embedded.
const PDF_FONTS = {
  sans: {
    regular: 'Helvetica',
    bold: 'Helvetica-Bold',
    italic: 'Helvetica-Oblique',
    boldItalic: 'Helvetica-BoldOblique',
  },
  serif: {
    regular: 'Times-Roman',
    bold: 'Times-Bold',
    italic: 'Times-Italic',
    boldItalic: 'Times-BoldItalic',
  },
} as const;

const INK = '#121212';
const MUTED = '#3f3f46';

/** The styles for a resume's template and design settings. */
export function resumeStyles({ template, design }: Pick<Resume, 'template' | 'design'>) {
  const look = RESUME_TEMPLATE_STYLES[template];
  const fonts = PDF_FONTS[design.font];
  const accent = RESUME_ACCENTS[design.accent];
  const gap = RESUME_SPACING_SCALE[design.spacing];
  const [marginY, marginX] = RESUME_MARGIN_POINTS[design.margins];
  const body = design.fontSize;
  return StyleSheet.create({
    page: {
      paddingVertical: marginY,
      paddingHorizontal: marginX,
      fontFamily: fonts.regular,
      fontSize: body,
      lineHeight: 1.35,
      color: INK,
    },
    name: {
      fontFamily: fonts.bold,
      fontSize: body * look.nameScale,
      textAlign: look.align,
      color: look.accentName ? accent : INK,
    },
    headline: { marginTop: 2, textAlign: look.align },
    contact: { marginTop: 4, color: MUTED, textAlign: look.align },
    section: { marginTop: 10 * gap },
    heading: {
      fontFamily: fonts.bold,
      fontSize: body + 0.5,
      color: accent,
      textTransform: look.uppercaseHeadings ? 'uppercase' : 'none',
      letterSpacing: look.uppercaseHeadings ? 0.8 : 0,
      ...(look.rule
        ? { borderBottomWidth: 0.75, borderBottomColor: accent, paddingBottom: 2 }
        : {}),
      marginBottom: 4 * gap,
    },
    row: { flexDirection: 'row', justifyContent: 'space-between' },
    regular: { fontFamily: fonts.regular },
    strong: { fontFamily: fonts.bold },
    italic: { fontFamily: fonts.italic },
    boldItalic: { fontFamily: fonts.boldItalic },
    muted: { color: MUTED },
    entry: { marginBottom: 5 * gap },
    bullet: { flexDirection: 'row', marginLeft: 6 },
    bulletMark: { width: 8 },
    bulletText: { flex: 1 },
  });
}
export type ResumeStyles = ReturnType<typeof resumeStyles>;
