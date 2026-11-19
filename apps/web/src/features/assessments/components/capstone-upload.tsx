'use client';

import { API_ROUTES } from '@siliconbox/shared';
import { usePathname } from 'next/navigation';
import { ActionForm } from '@/components/shared/action-form';
import { FileInput } from '@/components/ui/file-input';
import { sendToApi } from '@/lib/api-error';

type CapstoneUploadProps = { capstoneId: string; label: string; anchor: string };

/** Uploads the project as one .zip for an expert to grade. */
export function CapstoneUpload({ capstoneId, label, anchor }: CapstoneUploadProps) {
  const pathname = usePathname();
  return (
    <ActionForm
      next={`${pathname}#${anchor}`}
      submitLabel={label}
      pendingLabel="Uploading…"
      submitVariant="secondary"
      submit={(form) =>
        sendToApi(API_ROUTES.capstoneSubmission(capstoneId), { method: 'PUT', body: form })
      }
    >
      <FileInput name="file" accept=".zip,application/zip" aria-label="Project (.zip)" required />
      <p className="text-[12px] text-muted-foreground">
        One .zip of up to 10 MB with your design, properties, run scripts and report.
      </p>
    </ActionForm>
  );
}
