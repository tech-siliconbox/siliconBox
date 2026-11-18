import { MAX_NAME_LENGTH } from '@siliconbox/shared';
import { TextField } from '@/components/ui/text-field';

/** The account's name: at sign-up, and in Settings with the current one filled in. */
export function NameField({ defaultValue }: { defaultValue?: string }) {
  return (
    <TextField
      label="Name"
      name="name"
      defaultValue={defaultValue}
      autoComplete="name"
      maxLength={MAX_NAME_LENGTH}
      required
    />
  );
}
