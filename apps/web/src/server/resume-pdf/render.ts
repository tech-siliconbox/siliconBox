import 'server-only';
import type { Resume } from '@siliconbox/shared';
import { renderToBuffer } from '@react-pdf/renderer';
import { ResumeDocument } from './resume-document';

/** Called as a function (it uses no hooks) so the renderer receives its own Document element. */
export function renderResumePdf(resume: Resume): Promise<Buffer> {
  return renderToBuffer(ResumeDocument({ resume }));
}
