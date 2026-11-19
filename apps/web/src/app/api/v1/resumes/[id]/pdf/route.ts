import { resumeDownloadRoute } from '@/server/resume-download';
import { renderResumePdf } from '@/server/resume-pdf/render';

/** A saved resume as an ATS-friendly PDF download. */
export const GET = resumeDownloadRoute('pdf', renderResumePdf);
