'use client';

import { API_ROUTES, type Resume, resumeMarkdown, slugify, toJsonResume } from '@siliconbox/shared';
import { useRef } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { downloadText } from '@/lib/download-text';

type ExportMenuProps = {
  resume: Resume;
  /** The resume's id once it is saved; PDF and Word are built on the server from what is saved. */
  settle: () => Promise<string | null>;
};

/** Download as PDF or Word (from the saved resume), or as JSON Resume or Markdown (as on screen). */
export function ExportMenu({ resume, settle }: ExportMenuProps) {
  const menu = useRef<HTMLDetailsElement>(null);
  const base = `${slugify(resume.basics.fullName) || 'resume'}-resume`;
  const fromServer = async (route: (id: string) => string) => {
    const id = await settle();
    if (id !== null) window.location.assign(route(id));
  };
  const downloads = [
    { label: 'PDF (send this)', run: () => void fromServer(API_ROUTES.resumePdf) },
    { label: 'Word (.docx)', run: () => void fromServer(API_ROUTES.resumeDocx) },
    {
      label: 'JSON Resume (backup)',
      run: () =>
        downloadText(
          `${base}.json`,
          'application/json',
          JSON.stringify(toJsonResume(resume), null, 2),
        ),
    },
    {
      label: 'Markdown',
      run: () => downloadText(`${base}.md`, 'text/markdown', resumeMarkdown(resume)),
    },
  ];
  return (
    <details ref={menu} className="relative">
      <summary className={cn(buttonVariants({ size: 'sm' }), 'cursor-pointer list-none')}>
        Download
      </summary>
      <div className="absolute right-0 z-50 mt-2 flex w-56 flex-col gap-1 rounded-md border border-border bg-background p-2">
        {downloads.map(({ label, run }) => (
          <Button
            key={label}
            size="sm"
            variant="secondary"
            className="w-full justify-start"
            onClick={() => {
              if (menu.current !== null) menu.current.open = false;
              run();
            }}
          >
            {label}
          </Button>
        ))}
      </div>
    </details>
  );
}
