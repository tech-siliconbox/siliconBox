/** The plain text read from a file, as an applicant tracking system sees it; shown, never saved. */
export function AtsText({ text }: { text: string }) {
  return (
    <details className="rounded-card border border-border p-6">
      <summary className="cursor-pointer text-base font-bold tracking-tight">
        What an ATS reads
      </summary>
      <p className="mt-2 text-[12px] text-muted-foreground">
        The text we read from the file, in reading order. Words that are missing, run together or
        out of order here look the same to an applicant tracking system.
      </p>
      <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap font-mono text-[12px] leading-relaxed">
        {text}
      </pre>
    </details>
  );
}
