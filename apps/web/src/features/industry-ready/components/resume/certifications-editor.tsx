'use client';

import type { Resume } from '@siliconbox/shared';
import { TextField } from '@/components/ui/text-field';
import { ListEditor } from './list-editor';

type Certifications = Resume['certifications'];

export function CertificationsEditor({
  items,
  onChange,
}: {
  items: Certifications;
  onChange: (items: Certifications) => void;
}) {
  return (
    <ListEditor
      label="Certification"
      items={items}
      max={10}
      create={() => ({ name: '', issuer: '', year: new Date().getFullYear() })}
      onChange={onChange}
      render={(cert, set) => (
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_100px]">
          <TextField
            label="Name"
            value={cert.name}
            maxLength={120}
            onChange={(e) => set({ name: e.target.value })}
          />
          <TextField
            label="Issuer"
            value={cert.issuer}
            maxLength={80}
            onChange={(e) => set({ issuer: e.target.value })}
          />
          <TextField
            label="Year"
            type="number"
            min={1980}
            max={2100}
            value={cert.year}
            onChange={(e) => set({ year: Number(e.target.value) })}
          />
        </div>
      )}
    />
  );
}
