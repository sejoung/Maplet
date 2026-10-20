import { expect, it } from 'vitest';
import { driveSyncStatus } from '../../src/application/drive-sync';

const saved = {
  connected: true,
  hasFolder: true,
  awaitingRestore: false,
  busy: false,
  saving: false,
  paused: false,
  conflict: false,
  dirty: false,
  hasFile: true,
};
it.each([
  [{}, 'synced', '동기화 완료'],
  [{ dirty: true }, 'pending', '저장 대기'],
  [{ busy: true, saving: true, dirty: true }, 'saving', '저장 중'],
  [{ busy: true, awaitingRestore: true }, 'saving', '연결 복원 중'],
  [{ busy: true }, 'saving', '확인 중'],
  [{ awaitingRestore: true }, 'reconnect', '다시 연결 필요'],
  [{ connected: false }, 'reconnect', '다시 연결 필요'],
  [{ paused: true, dirty: true }, 'error', '동기화 오류'],
  [{ paused: true, conflict: true }, 'error', '동기화 충돌'],
  [{ hasFile: false }, 'ready', '저장 준비됨'],
  [{ hasFolder: false, hasFile: false }, 'ready', '저장 위치 선택'],
] as const)(
  'reports the current save state rather than just authorization: %j',
  (changes, kind, label) => {
    expect(driveSyncStatus({ ...saved, ...changes })).toEqual({ kind, label });
  },
);
