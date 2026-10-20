import { useEffect, useState } from 'react';
import type { DraftStore } from '../adapters/storage/drafts';
import { DRAFT_PRIVACY_KEY, keepLocalDrafts } from '../adapters/storage/privacy';

export function useDraftPrivacy(
  store: DraftStore,
  status: (message: string) => void,
  error: (message: string) => void,
) {
  const [enabled, setEnabled] = useState(store.enabled);
  const [busy, setBusy] = useState(false);
  const change = async (next: boolean) => {
    setBusy(true);
    setEnabled(next);
    try {
      await store.configure(next);
      status(next ? '초안 자동 보관을 켰습니다.' : '기기 초안 보관 꺼짐');
    } catch {
      error('기기 초안을 삭제하지 못했습니다. 브라우저의 사이트 데이터 설정에서 삭제해 주세요.');
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key === DRAFT_PRIVACY_KEY || event.key === null) void change(keepLocalDrafts());
    };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  });
  return { enabled, busy, change };
}
