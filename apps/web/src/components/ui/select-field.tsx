import { useId } from 'react';
import { cn } from '@/lib/cn';
import { CONTROL_CLASS, Field } from './field';

type SelectFieldProps<T extends string> = {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  className?: string;
};

/** A labelled choice of one option; `onChange` gets the option's own value. */
export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: SelectFieldProps<T>) {
  const id = useId();
  return (
    <Field id={id} label={label}>
      <select
        id={id}
        value={value}
        onChange={(event) => {
          const chosen = options.find((option) => option.value === event.target.value);
          if (chosen !== undefined) onChange(chosen.value);
        }}
        className={cn('h-10', CONTROL_CLASS, className)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}
