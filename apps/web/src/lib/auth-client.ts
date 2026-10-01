import { twoFactorClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

// The sign-in form sends the learner to the code page itself, so no redirect option here.
export const authClient = createAuthClient({ plugins: [twoFactorClient()] });
