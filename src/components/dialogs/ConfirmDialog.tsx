import { Dialog, DialogActions } from './Dialog';

export interface ConfirmRequest {
  title: string;
  message: string;
  /** Names the action, e.g. "Discard changes and open", never a bare "OK". */
  confirmLabel: string;
  danger?: boolean;
}

/** An in-app replacement for `window.confirm`; Cancel takes the focus so Enter is safe. */
export function ConfirmDialog({
  request,
  onAnswer,
}: {
  request: ConfirmRequest;
  onAnswer(confirmed: boolean): void;
}) {
  return (
    <Dialog title={request.title} onClose={() => onAnswer(false)}>
      <p>{request.message}</p>
      <DialogActions
        onCancel={() => onAnswer(false)}
        focusCancel
        submitLabel={request.confirmLabel}
        danger={request.danger}
        onSubmit={() => onAnswer(true)}
      />
    </Dialog>
  );
}
