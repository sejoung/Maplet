import { useState } from 'react';
import { Dialog } from '../components/Dialog';
import { useI18n } from '../i18n/react';
import type { DriveMergeConflict } from './driveMerge';
import type { MergeChoices } from '../domain/merge';
import { parseMaplet } from '../adapters/maplet/codec';

const labels: Record<string, string> = {
  title: '노드 제목',
  notes: '메모',
  links: '링크',
  position: '위치',
  parentId: '부모 노드',
  rank: '노드 순서',
  side: '방향',
  collapsed: '접기',
  style: '스타일',
  filename: '파일 이름',
  structure: '노드 구조',
  document: '문서',
  background: '배경색',
  color: '글자 색상',
  fontFamily: '글꼴',
  fontSize: '글자 크기',
  fontWeight: '글자 굵기',
  textAlign: '텍스트 정렬',
  width: '너비',
  group: '그룹 위치',
};
export function DriveMergeDialog({
  conflict,
  busy,
  resolve,
  close,
  download,
  copy,
}: {
  conflict: DriveMergeConflict;
  busy: boolean;
  resolve(choices: MergeChoices): void;
  close(): void;
  download(): void;
  copy(): void;
}) {
  const { t } = useI18n();
  const [selection, setSelection] = useState<{
    conflict: DriveMergeConflict;
    choices: MergeChoices;
  }>({ conflict, choices: {} });
  const choices = selection.conflict === conflict ? selection.choices : {};
  const local = parseMaplet(conflict.local.content),
    remote = parseMaplet(conflict.remote.content);
  const value = (item: unknown) =>
    item === undefined
      ? t('삭제됨')
      : typeof item === 'string'
        ? item
        : JSON.stringify(item, null, 2);
  return (
    <Dialog title={t('충돌한 변경 확인')} onClose={close}>
      <p>
        {t('겹치지 않는 변경은 자동으로 합쳤습니다. 충돌한 항목에서 유지할 내용을 선택해 주세요.')}
      </p>
      <div className="merge-conflicts">
        {conflict.conflicts.map((item, index) => {
          const node = item.nodeId && (local.nodes[item.nodeId] ?? remote.nodes[item.nodeId]);
          const field =
            item.path.map((part) => t(labels[part] ?? part)).join(' · ') ||
            t('노드 삭제 또는 수정');
          return (
            <fieldset key={item.id} className="merge-conflict">
              <legend>{node ? `${node.title} · ${field}` : field}</legend>
              <details>
                <summary>{t('마지막 동기화 내용')}</summary>
                <pre>{value(item.base)}</pre>
              </details>
              {(['local', 'remote'] as const).map((side) => (
                <label key={side} className="merge-choice">
                  <span>
                    <input
                      type="radio"
                      name={`merge-${index}`}
                      value={side}
                      checked={choices[item.id] === side}
                      onChange={() =>
                        setSelection({ conflict, choices: { ...choices, [item.id]: side } })
                      }
                    />
                    {t(side === 'local' ? '내 변경 유지' : 'Drive 변경 유지')}
                  </span>
                  <pre>{value(item[side])}</pre>
                </label>
              ))}
            </fieldset>
          );
        })}
      </div>
      <div className="drive-actions">
        <button
          className="button primary"
          disabled={busy || conflict.conflicts.some((item) => !choices[item.id])}
          onClick={() => resolve(choices)}
        >
          {t('선택한 내용 병합 후 저장')}
        </button>
        <button className="button" disabled={busy} onClick={download}>
          {t('로컬 파일 다운로드')}
        </button>
        <button className="button" disabled={busy} onClick={copy}>
          {t('새 사본으로 저장')}
        </button>
        <button className="button quiet" onClick={close}>
          {t('편집으로 돌아가기')}
        </button>
      </div>
    </Dialog>
  );
}
