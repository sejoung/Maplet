import type { GoogleConnection } from '../adapters/drive/google';
import { messageOf, type Message } from '../domain/errors';

export function driveDisconnect(
  google: GoogleConnection | null,
  reset: () => void,
  busy: (value: boolean) => void,
  error: (message: Message | null) => void,
) {
  return async () => {
    const revoked = google?.disconnect();
    reset();
    busy(true);
    try {
      await revoked;
    } catch (reason) {
      error(messageOf(reason, 'Google 권한 철회를 확인하지 못했습니다.'));
    } finally {
      busy(false);
    }
  };
}
