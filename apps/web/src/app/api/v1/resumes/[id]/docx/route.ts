import { renderResumeDocx } from '@/server/resume-docx/render';
import { resumeDownloadRoute } from '@/server/resume-download';

/** A saved resume as a Word (.docx) download, for recruiters who ask for Word. */
export const GET = resumeDownloadRoute('docx', renderResumeDocx);
