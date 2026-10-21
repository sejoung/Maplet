import { useI18n } from '../i18n/react';
import { Dialog } from './Dialog';

export function ShortcutHelpDialog({
  onClose,
  saveToDrive = false,
}: {
  onClose(): void;
  saveToDrive?: boolean;
}) {
  const { t } = useI18n();
  return (
    <Dialog title={t('단축키')} onClose={onClose}>
      <p className="muted">{t('캔버스에서 노드를 선택한 뒤 사용하세요.')}</p>
      <dl className="shortcut-list">
        {[
          ['Tab', '하위 노드 추가'],
          ['Enter', '형제 노드 추가'],
          ['F2 / 더블클릭', '제목 편집'],
          ['방향키', '노드 사이 이동'],
          ['Delete / ⌫', '노드와 하위 노드 삭제'],
          ['⌘ / Ctrl + C · X · V', '가지 복사 · 잘라내기 · 붙여넣기'],
          ['⌘ / Ctrl + D', '가지 복제'],
          ['Alt + ↑ / ↓', '형제 사이 순서 변경'],
          ['우클릭 / Shift + F10', '노드 메뉴 열기'],
          ['⌘ / Ctrl + Z', '실행 취소'],
          ['⌘ / Ctrl + Shift + Z', '다시 실행'],
          ['⌘ / Ctrl + S', saveToDrive ? 'Drive에 저장' : '.maplet 파일 다운로드'],
          ['Space + 드래그', '캔버스 이동'],
          ['Ctrl + 휠 / 핀치', '확대·축소'],
          ['⌘ / Ctrl + + / − / 0', '확대 · 축소 · 화면에 맞추기'],
          ['모서리 드래그', '노드 크기 조절'],
          ['모서리 더블클릭 / Home', '자동 크기'],
          ['노드 드래그', '위치·연결선 길이 조절'],
        ].map(([key, action]) => (
          <div key={key}>
            <dt>
              <kbd>{t(key)}</kbd>
            </dt>
            <dd>{t(action)}</dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}
