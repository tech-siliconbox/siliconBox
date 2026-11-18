import 'server-only';
import type { Email } from './email';

// Account emails that carry one link: confirm an address, reset a password. Better Auth's links
// stay valid for an hour.

const LINK_VALID_FOR = 'one hour';

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

type To = { name: string; email: string };
type LinkEmail = { subject: string; intro: string; button: string; outro: string };

/** One link email in plain text and simple HTML, with the same words. */
function linkEmail(to: To, url: string, { subject, intro, button, outro }: LinkEmail): Email {
  const name = to.name.trim() || 'there';
  return {
    to: to.email,
    subject,
    text: `Hello ${name},\n\n${intro}\n\n${url}\n\n${outro}\n`,
    html: [
      `<p>Hello ${escapeHtml(name)},</p>`,
      `<p>${intro}</p>`,
      `<p><a href="${escapeHtml(url)}" style="display:inline-block;padding:10px 18px;background:#121212;color:#ffffff;border-radius:8px;text-decoration:none;font-weight:600">${button}</a></p>`,
      `<p style="color:#595959;font-size:13px">${outro}</p>`,
    ].join('\n'),
  };
}

/** Confirms a learner's address after sign-up. */
export const verificationEmail = (to: To, url: string): Email =>
  linkEmail(to, url, {
    subject: 'Confirm your email for SiliconBox',
    intro: 'Confirm your email address to finish setting up your SiliconBox account.',
    button: 'Confirm my email',
    outro: `The link works for ${LINK_VALID_FOR}. If you did not create an account, ignore this email.`,
  });

/** Lets a learner choose a new password. */
export const passwordResetEmail = (to: To, url: string): Email =>
  linkEmail(to, url, {
    subject: 'Reset your SiliconBox password',
    intro: 'We received a request to reset the password for your SiliconBox account.',
    button: 'Set a new password',
    outro: `The link works for ${LINK_VALID_FOR}. If you did not ask for this, ignore this email: your password stays the same.`,
  });
