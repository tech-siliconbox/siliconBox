'use client';

import { API_ROUTES, ROUTES } from '@siliconbox/shared';
import { Avatar } from '@/components/shared/avatar';
import { apiResult } from '@/lib/api-error';
import { useAuthAction } from '../hooks/use-auth-action';
import { AuthForm } from './auth-form';
import { FormError } from './form-error';

const FILE_INPUT =
  'text-sm text-muted-foreground file:mr-3 file:rounded-[7px] file:border file:border-border file:bg-background file:px-3 file:py-1.5 file:text-[13px] file:font-semibold file:text-foreground hover:file:border-foreground';

const sendPhoto = (init: RequestInit) =>
  fetch(API_ROUTES.profilePhoto, init)
    .catch(() => null)
    .then(apiResult);

function RemovePhoto() {
  const { pending, error, run } = useAuthAction(ROUTES.settings);
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
        <AuthForm
          next={ROUTES.settings}
          submitLabel="Upload photo"
          pendingLabel="Uploading…"
          submitVariant="secondary"
          submit={(form) => sendPhoto({ method: 'PUT', body: form })}
        >
          <input
            type="file"
            name="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label="Photo"
            required
            className={FILE_INPUT}
          />
          <p className="text-[12px] text-muted-foreground">
            JPEG, PNG or WebP, up to 5 MB. It is cropped to a square; camera and location details
            are removed.
          </p>
        </AuthForm>
        {photoUrl !== null && <RemovePhoto />}
      </div>
    </div>
  );
}
