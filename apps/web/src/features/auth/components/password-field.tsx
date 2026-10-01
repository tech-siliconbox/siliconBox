import { TextField } from '@/components/ui/text-field';

export function PasswordField({ label = 'Password' }: { label?: string }) {
  return (
    <TextField
      label={label}
      name="password"
      type="password"
      autoComplete="current-password"
      required
    />
  );
}
