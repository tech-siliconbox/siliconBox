'use client';

import type { Resume } from '@siliconbox/shared';
import { TextField } from '@/components/ui/text-field';
import { LinksEditor } from './links-editor';

type Basics = Resume['basics'];

export function BasicsEditor({
  basics,
  onChange,
}: {
  basics: Basics;
  onChange: (basics: Basics) => void;
}) {
  const set = (patch: Partial<Basics>) => onChange({ ...basics, ...patch });
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label="Full name"
          value={basics.fullName}
          maxLength={80}
          onChange={(e) => set({ fullName: e.target.value })}
        />
        <TextField
          label="Headline"
          placeholder="Formal Verification Engineer"
          value={basics.headline}
          maxLength={120}
          onChange={(e) => set({ headline: e.target.value })}
        />
        <TextField
          label="Email"
          type="email"
          value={basics.email}
          onChange={(e) => set({ email: e.target.value })}
        />
        <TextField
          label="Phone"
          placeholder="+91 98765 43210"
          value={basics.phone}
          maxLength={30}
          onChange={(e) => set({ phone: e.target.value })}
        />
        <TextField
          label="Location"
          placeholder="Bengaluru, India"
          value={basics.location}
          maxLength={80}
          onChange={(e) => set({ location: e.target.value })}
        />
      </div>
      <LinksEditor links={basics.links} onChange={(links) => set({ links })} />
    </div>
  );
}
