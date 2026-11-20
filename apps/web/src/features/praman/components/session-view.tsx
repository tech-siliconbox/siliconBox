'use client';

import type { ComponentProps } from 'react';
import { usePramanSession } from '../hooks/use-praman-session';
import { PramanScreen } from './praman-screen';

type SessionViewProps = Omit<ComponentProps<typeof PramanScreen>, 'session'> & {
  sessionId: string;
  name: string;
};

/**
 * The chosen session on Praman's screen: opened on the formal tool and polled while shown.
 * Render it keyed by the session id, so another session starts from a fresh screen.
 */
export function SessionView({ sessionId, name, ...screen }: SessionViewProps) {
  const { state, actions } = usePramanSession(sessionId);
  return <PramanScreen session={{ id: sessionId, name, state, actions }} {...screen} />;
}
