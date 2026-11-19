// What counts as contact and personal detail in a CV: the screener checks for it, and the text
// sent for AI feedback has it removed. Patterns are not global, so `.test` is safe with them.

export const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/;

/** A web address, with or without the scheme: "https://…", "www.…", "linkedin.com/in/…". */
export const WEB_LINK = /\b(https?:\/\/|www\.)\S+|\b[\w.-]+\.(com|in|io|org|net|dev|me|co)\/\S*/i;

export const PERSONAL_DETAILS =
  /\b(date of birth|d\.?o\.?b\.?|marital status|religion|caste|father'?s name|mother'?s name|nationality|gender)\b/i;

/** Runs of digits, spaces and dashes holding at least 10 digits, so dates do not count. */
export function phoneNumbers(text: string): string[] {
  return (text.match(/\+?\d[\d\s-]{8,}\d/g) ?? []).filter(
    (run) => run.replace(/\D/g, '').length >= 10,
  );
}
