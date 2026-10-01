'use client';

import type { Resume } from '@siliconbox/shared';
import { TextField } from '@/components/ui/text-field';
import { ListEditor } from './list-editor';

type Links = Resume['basics']['links'];

export function LinksEditor({
  links,
  onChange,
}: {
  links: Links;
  onChange: (links: Links) => void;
}) {
  return (
    <ListEditor
      label="Link"
      items={links}
      max={4}
      create={() => ({ label: 'LinkedIn', url: 'https://' })}
      onChange={onChange}
      render={(link, setLink) => (
        <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
          <TextField
            label="Label"
            value={link.label}
            maxLength={30}
            onChange={(e) => setLink({ label: e.target.value })}
          />
          <TextField
            label="URL (https)"
            type="url"
            value={link.url}
            onChange={(e) => setLink({ url: e.target.value })}
          />
        </div>
      )}
    />
  );
}
