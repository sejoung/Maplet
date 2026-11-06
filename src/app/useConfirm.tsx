import { useCallback, useRef, useState } from 'react';
import { ConfirmDialog, type ConfirmRequest } from '../components/dialogs/ConfirmDialog';

interface Pending {
  request: ConfirmRequest;
  resolve(confirmed: boolean): void;
}

/** Asks with an app dialog and resolves once answered; a newer question cancels an older one. */
export function useConfirm() {
  const [pending, setPending] = useState<Pending | null>(null);
  const current = useRef<Pending | null>(null);
  const confirm = useCallback(
    (request: ConfirmRequest) =>
      new Promise<boolean>((resolve) => {
        current.current?.resolve(false);
        current.current = { request, resolve };
        setPending(current.current);
      }),
    [],
  );
  const answer = useCallback((confirmed: boolean) => {
    current.current?.resolve(confirmed);
    current.current = null;
    setPending(null);
  }, []);
  const dialog = pending && <ConfirmDialog request={pending.request} onAnswer={answer} />;
  return { confirm, dialog };
}
