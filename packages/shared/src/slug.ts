const SLUG_MAX = 80;

/**
 * Lowercase words joined by hyphens, for readable URLs and anchors:
 * "4.4 Open-source setup: SymbiYosys" becomes "4-4-open-source-setup-symbiyosys".
 */
export function slugify(text: string, maxLength: number = SLUG_MAX): string {
  return (
    text
      .normalize('NFKD')
      // Accents split off by NFKD are dropped, so "é" reads as "e".
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, maxLength)
      .replace(/^-+|-+$/g, '')
  );
}
