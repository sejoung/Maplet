export interface DriveSyncStatus {
  kind: 'ready' | 'pending' | 'saving' | 'synced' | 'error' | 'reconnect';
  label: string;
}
interface SyncInput {
  connected: boolean;
  hasFolder: boolean;
  awaitingRestore: boolean;
  busy: boolean;
  saving: boolean;
  paused: boolean;
  conflict: boolean;
  dirty: boolean;
  hasFile: boolean;
}
export function driveSyncStatus(state: SyncInput): DriveSyncStatus {
  if (state.busy)
    return {
      kind: 'saving',
      label: state.awaitingRestore ? '연결 복원 중' : state.saving ? '저장 중' : '확인 중',
    };
  if (state.awaitingRestore || !state.connected)
    return { kind: 'reconnect', label: '다시 연결 필요' };
  if (state.paused) return { kind: 'error', label: state.conflict ? '동기화 충돌' : '동기화 오류' };
  if (!state.hasFolder) return { kind: 'ready', label: '저장 위치 선택' };
  if (state.dirty) return { kind: 'pending', label: '저장 대기' };
  if (!state.hasFile) return { kind: 'ready', label: '저장 준비됨' };
  return { kind: 'synced', label: '동기화 완료' };
}

/** Latest Drive operation outcome. Logic compares kinds; only the UI reads labels. */
export const DRIVE_ACTIVITY = {
  idle: '연결하지 않음',
  saving: 'Drive 저장 중…',
  saved: 'Drive에 저장됨',
  waiting: 'Drive 저장 대기 중…',
  conflict: '충돌 · 현재 편집 유지',
  saveFailed: '저장 실패 · 현재 편집 유지',
  reconnected: '저장 위치와 파일을 다시 연결했습니다.',
  folderSelected: '저장 폴더를 선택했습니다. 파일을 열거나 현재 맵을 저장하세요.',
  folderCancelled: '저장 위치 선택을 취소했습니다.',
  fileCancelled: '파일 선택을 취소했습니다.',
  opened: 'Drive 파일을 열었습니다',
  openFailed: '열기 실패 · 로컬 파일 유지',
  disconnected: '연결 해제됨',
} as const;
export type DriveActivity = keyof typeof DRIVE_ACTIVITY;

export const AUTO_SAVE_LABELS = {
  restoring: 'Drive 연결 복원 중…',
  reconnect: 'Drive 다시 연결 필요',
  stopped: 'Drive 자동 저장 중지',
  saving: 'Drive 저장 중…',
  waiting: 'Drive 저장 대기 중…',
  ready: '편집하면 선택한 폴더에 자동 저장됩니다',
  saved: 'Drive에 저장됨',
} as const;
export type AutoSaveState = keyof typeof AUTO_SAVE_LABELS;

interface AutoSaveInput {
  hasFolder: boolean;
  awaitingRestore: boolean;
  busy: boolean;
  paused: boolean;
  connected: boolean;
  dirty: boolean;
  hasFile: boolean;
}
export function autoSaveState(state: AutoSaveInput): AutoSaveState | null {
  if (!state.hasFolder) return null;
  if (state.awaitingRestore) return state.busy ? 'restoring' : 'reconnect';
  if (state.paused || !state.connected) return 'stopped';
  if (state.busy) return 'saving';
  if (state.dirty) return 'waiting';
  return state.hasFile ? 'saved' : 'ready';
}
