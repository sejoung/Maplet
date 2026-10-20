import { useEffect, useRef } from 'react';
import type { Draft, DraftStore } from '../adapters/storage/drafts';

export function useDraftPersistence(
  store: DraftStore,
  draft: Omit<Draft, 'updatedAt'>,
  enabled: boolean,
  onStatus: (status: string) => void,
  onError: (message: string) => void,
) {
  const queue = useRef(Promise.resolve());
  const { content, original, filename, filenamePending, savedContent, savedFilename, drive } =
    draft;
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    onStatus('초안 저장 중…');
    const timer = window.setTimeout(() => {
      const snapshot = {
        content,
        original,
        filename,
        filenamePending,
        savedContent,
        savedFilename,
        drive,
        updatedAt: Date.now(),
      };
      queue.current = queue.current.catch(() => {}).then(() => store.save(snapshot));
      queue.current
        .then(() => {
          if (active) onStatus('브라우저에 초안 저장됨');
        })
        .catch(() => {
          if (active) {
            onStatus('초안 저장 실패');
            onError('브라우저에 초안을 저장하지 못했습니다. 파일을 다운로드해 주세요.');
          }
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [
    store,
    enabled,
    content,
    original,
    filename,
    filenamePending,
    savedContent,
    savedFilename,
    drive,
    onStatus,
    onError,
  ]);
}
