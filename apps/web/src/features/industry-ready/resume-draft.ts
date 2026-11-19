import { type Resume, type SavedResume, emptyResume } from '@siliconbox/shared';

// The resume open in the builder, shared by the server page that starts it and the client hooks
// that edit it (so this module is not client-only).

/** The resume being edited; `publicId` is null until the first edit's save creates it. */
export type ResumeDraft = { publicId: string | null; title: string; resume: Resume };

/** The learner's account details a blank resume or an import starts from. */
export type Account = { name: string; email: string };

export const toDraft = ({ publicId, title, resume }: SavedResume): ResumeDraft => ({
  publicId,
  title,
  resume,
});

/** A blank resume from the account, not saved until the learner edits it. */
export const blankDraft = (account: Account): ResumeDraft => ({
  publicId: null,
  title: 'My resume',
  resume: emptyResume(account.name, account.email),
});
