import { CspImage } from '@/components/ui/csp-image';

type CompanyTagProps = { name: string; logoUrl?: string };

/**
 * A company on a question: logo with the name beside it. The logo is omitted until usage
 * permission is confirmed (docs/legal/trademark-and-logos.md), so the name always shows.
 */
export function CompanyTag({ name, logoUrl }: CompanyTagProps) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded border border-border px-2 py-0.5 text-[12px]">
      {logoUrl !== undefined && <CspImage src={logoUrl} alt="" width={14} height={14} />}
      <span>{name}</span>
    </span>
  );
}
