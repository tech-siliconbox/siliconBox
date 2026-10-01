'use client';

import { ROUTES } from '@siliconbox/shared';
import { useState } from 'react';
import { TextField } from '@/components/ui/text-field';
import { authClient } from '@/lib/auth-client';
import { formValue } from '../form-value';
import { AuthForm } from './auth-form';
import { PasswordField } from './password-field';
import { TotpQrCode } from './totp-qr-code';

type Setup = { totpURI: string; backupCodes: string[] };

/** Password, then scan and confirm one code. Two-factor turns on only after that code checks out. */
export function EnableTwoFactor() {
  const [setup, setSetup] = useState<Setup | null>(null);

  if (setup === null) {
    return (
      <AuthForm
        next={null}
        submitLabel="Turn on two-factor"
        pendingLabel="Starting…"
        submit={async (form) => {
          const result = await authClient.twoFactor.enable({
            password: formValue(form, 'password'),
          });
          if (result.data?.method === 'totp') setSetup(result.data);
          return result;
        }}
      >
        <PasswordField label="Confirm your password" />
      </AuthForm>
    );
  }

  return <SetupStep setup={setup} />;
}

/** Scan, save the backup codes, then confirm one code to finish. */
function SetupStep({ setup }: { setup: Setup }) {
  return (
    <div className="flex flex-col gap-5">
      <TotpQrCode uri={setup.totpURI} />
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">
          Backup codes: save them now, they are shown only once.
        </p>
        <ul data-testid="backup-codes" className="grid grid-cols-2 gap-1 font-mono text-[12px]">
          {setup.backupCodes.map((code) => (
            <li key={code}>{code}</li>
          ))}
        </ul>
      </div>
      <AuthForm
        next={ROUTES.account}
        submitLabel="Confirm and turn on"
        pendingLabel="Checking…"
        submit={(form) => authClient.twoFactor.verifyTotp({ code: formValue(form, 'code') })}
      >
        <TextField
          label="Code from your authenticator app"
          name="code"
          autoComplete="one-time-code"
          inputMode="numeric"
          pattern="\d{6}"
          required
        />
      </AuthForm>
    </div>
  );
}
