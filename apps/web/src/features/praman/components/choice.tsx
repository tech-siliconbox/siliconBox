import type { ReactNode } from 'react';

type ChoiceProps = {
  type: 'checkbox' | 'radio';
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Radios of one question share a name. */
  name?: string;
  children: ReactNode;
};

/** A checkbox or radio with its words, as the tool's dialogs list them. */
export function Choice({ type, checked, onChange, name, children }: ChoiceProps) {
  return (
    <label className="flex items-center gap-2 py-0.5">
      <input
        type={type}
        name={name}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="accent-info"
      />
      {children}
    </label>
  );
}
