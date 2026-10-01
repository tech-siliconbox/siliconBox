import 'server-only';
import type { Resume } from '@siliconbox/shared';
import { StyleSheet } from '@react-pdf/renderer';

// Built-in Helvetica: every ATS extracts it cleanly. Single column, no tables or images.
const SIZES = {
  classic: { name: 20, body: 10, heading: 10.5, gap: 10 },
  compact: { name: 16, body: 9, heading: 9.5, gap: 7 },
} as const;

export function resumeStyles(template: Resume['template']) {
  const size = SIZES[template];
  return StyleSheet.create({
    page: {
      paddingVertical: 36,
      paddingHorizontal: 42,
      fontFamily: 'Helvetica',
      fontSize: size.body,
      lineHeight: 1.35,
      color: '#121212',
    },
    name: {
      fontFamily: 'Helvetica-Bold',
      fontSize: size.name,
      textAlign: template === 'classic' ? 'center' : 'left',
    },
    headline: { marginTop: 2, textAlign: template === 'classic' ? 'center' : 'left' },
    contact: {
      marginTop: 4,
      color: '#3f3f46',
      textAlign: template === 'classic' ? 'center' : 'left',
    },
    section: { marginTop: size.gap },
    heading: {
      fontFamily: 'Helvetica-Bold',
      fontSize: size.heading,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      borderBottomWidth: 0.75,
      borderBottomColor: '#121212',
      paddingBottom: 2,
      marginBottom: 4,
    },
    row: { flexDirection: 'row', justifyContent: 'space-between' },
    strong: { fontFamily: 'Helvetica-Bold' },
    muted: { color: '#3f3f46' },
    entry: { marginBottom: 5 },
    bullet: { flexDirection: 'row', marginLeft: 6 },
    bulletMark: { width: 8 },
    bulletText: { flex: 1 },
  });
}
export type ResumeStyles = ReturnType<typeof resumeStyles>;
