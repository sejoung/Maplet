import { useState } from 'react';
import { DriveAuthError } from '../adapters/drive/client';
import type { DriveAuth } from '../adapters/drive/types';
import { messageOf } from '../domain/errors';
import type { DriveOperation } from './useDriveOperation';

/** Google sign-in state: whether Drive's scripts are loaded and a token is held. */
export function useDriveConnection(
  google: DriveAuth | null,
  operation: DriveOperation,
  showDialog: () => void,
) {
  const [ready, setReady] = useState(false);
  const [connected, setConnected] = useState(() => Boolean(google?.getToken()));
  return {
    ready,
    connected,
    setConnected,
    /** Load Google's scripts once; the Picker needs them. */
    prepare: () => {
      if (!google || ready) return;
      void operation.track(
        google.prepare().then(() => setReady(true)),
        'drive.couldNotPrepareDrive',
      );
    },
    /** Prepare inside a running operation, which reports failures itself. */
    prepareNow: async () => {
      await google?.prepare();
      setReady(true);
    },
    /** Sign in unless a token is already held; Google's popup needs a user gesture. */
    authorize: async () => {
      if (!google) return;
      if (!connected || !google.getToken()) await google.connect();
      setConnected(true);
    },
    /** Report a failed operation; a rejected token also ends the connection. */
    fail: (reason: unknown, show = true) => {
      if (reason instanceof DriveAuthError) google?.clearToken();
      if (reason instanceof DriveAuthError || !google?.getToken()) setConnected(false);
      operation.setError(messageOf(reason, 'drive.couldNotCompleteDriveOperation'));
      if (show) showDialog();
    },
    /** Revoke access; local state is reset at once, and only an unconfirmed revoke reports. */
    disconnect: async (reset: () => void) => {
      const revoked = google?.disconnect();
      reset();
      await operation.track(revoked, 'drive.revokeUnconfirmed');
    },
  };
}
export type DriveConnection = ReturnType<typeof useDriveConnection>;
