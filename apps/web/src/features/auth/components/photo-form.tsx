'use client';

import { API_ROUTES, ROUTES } from '@siliconbox/shared';
import { Avatar } from '@/components/shared/avatar';
import { FileInput } from '@/components/ui/file-input';
import { sendToApi } from '@/lib/api-error';
import { useFormAction } from '@/hooks/use-form-action';
import { ActionForm } from '@/components/shared/action-form';
import { FormError } from '@/components/ui/form-error';

const sendPhoto = (init: RequestInit) => sendToApi(API_ROUTES.profilePhoto, init);

function RemovePhoto() {
  const { pending, error, run } = useFormAction(ROUTES.settings);
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => void run(() => sendPhoto({ method: 'DELETE' }))}
        className="self-start text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
      >
        {pending ? 'Removing…' : 'Remove photo'}
      </button>
      <FormError message={error} />
    </div>
  );
}

type PhotoFormProps = { name: string; email: string; photoUrl: string | null };

/** The profile photo: upload a new one (cropped to a square on the server) or remove it. */
export function PhotoForm({ name, email, photoUrl }: PhotoFormProps) {
  return (
    <div className="flex items-start gap-4">
      <Avatar name={name} email={email} photoUrl={photoUrl} size="lg" />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <ActionForm
          next={ROUTES.settings}
          submitLabel="Upload photo"
          pendingLabel="Uploading…"
          submitVariant="secondary"
          submit={(form) => sendPhoto({ method: 'PUT', body: form })}
        >
          <FileInput
            name="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label="Photo"
            required
          />
          <p className="text-[12px] text-muted-foreground">
            JPEG, PNG or WebP, up to 5 MB. It is cropped to a square; camera and location details
            are removed.
          </p>
        </ActionForm>
        {photoUrl !== null && <RemovePhoto />}
      </div>
    </div>
  );
}
