'use client';

import { TextAreaField } from '@/components/ui/text-area-field';

/** One bullet per line. Empty lines are kept while typing and dropped on save. */
export function BulletsField({
  bullets,
  onChange,
}: {
  bullets: string[];
  onChange: (bullets: string[]) => void;
}) {
  return (
    <TextAreaField
      label="Achievements (one per line; start with a verb, add numbers)"
      value={bullets.join('\n')}
      onChange={(event) => onChange(event.target.value.split('\n'))}
      rows={4}
    />
  );
}
