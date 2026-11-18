'use client';

import {
  API_ROUTES,
  BIO_MAX_LENGTH,
  PROFILE_LINKS,
  type Profile,
  ProfileSchema,
  ROUTES,
} from '@siliconbox/shared';
import { TextAreaField } from '@/components/ui/text-area-field';
import { TextField } from '@/components/ui/text-field';
import { sendToApi } from '@/lib/api-error';
import { formValue } from '../form-value';
import { ActionForm } from '@/components/shared/action-form';

const optional = (value: string) => value.trim() || null;

/** The form as a profile, checked with the rules the server uses, so mistakes show at once. */
function profileFrom(form: FormData) {
  return ProfileSchema.safeParse({
    handle: optional(formValue(form, 'handle').toLowerCase()),
    bio: formValue(form, 'bio'),
    links: Object.fromEntries(
      PROFILE_LINKS.map(({ key }) => [key, optional(formValue(form, key))]),
    ),
  });
}

async function saveProfile(form: FormData) {
  const parsed = profileFrom(form);
  if (!parsed.success) return { error: { message: parsed.error.issues[0]?.message } };
  return sendToApi(API_ROUTES.profile, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(parsed.data),
  });
}

/** The handle, bio and links others will see. */
export function ProfileForm({ profile }: { profile: Profile }) {
  return (
    <ActionForm
      next={ROUTES.settings}
      submitLabel="Save profile"
      pendingLabel="Saving…"
      submit={saveProfile}
    >
      <TextField
        label="Handle"
        name="handle"
        defaultValue={profile.handle ?? ''}
        placeholder="3 to 30 lowercase letters, digits or _"
        autoComplete="username"
        maxLength={30}
      />
      <TextAreaField
        label="Bio"
        name="bio"
        defaultValue={profile.bio}
        placeholder="What you work on, and what you want to learn."
        maxLength={BIO_MAX_LENGTH}
      />
      {PROFILE_LINKS.map(({ key, label, example }) => (
        <TextField
          key={key}
          label={label}
          name={key}
          type="url"
          defaultValue={profile.links[key] ?? ''}
          placeholder={example}
        />
      ))}
    </ActionForm>
  );
}
