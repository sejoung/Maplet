import type { GoogleConnection } from '../adapters/drive/google';

export function driveDisconnect(
  google: GoogleConnection | null,
  reset: () => void,
  busy: (value: boolean) => void,
  error: (message: string | null) => void,
) {
  return async () => {
    const revoked = google?.disconnect();
    reset();
    busy(true);
    try {
      await revoked;
    } catch (reason) {
      error(reason instanceof Error ? reason.message : 'Google 권한 철회를 확인하지 못했습니다.');
    } finally {
      busy(false);
    }
  };
}
