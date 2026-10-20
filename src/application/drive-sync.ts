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
