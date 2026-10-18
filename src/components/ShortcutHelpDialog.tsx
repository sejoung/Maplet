import { Dialog } from './Dialog';

export function ShortcutHelpDialog({ onClose }: { onClose(): void }) {
  return (
    <Dialog title="단축키" onClose={onClose}>
      <p className="muted">캔버스에서 노드를 선택한 뒤 사용하세요.</p>
      <dl className="shortcut-list">
        {[
          ['Tab', '하위 노드 추가'],
          ['Enter', '형제 노드 추가'],
          ['F2 / 더블클릭', '제목 편집'],
          ['방향키', '노드 사이 이동'],
          ['Delete / ⌫', '노드와 하위 노드 삭제'],
          ['⌘ / Ctrl + Z', '실행 취소'],
          ['⌘ / Ctrl + Shift + Z', '다시 실행'],
          ['⌘ / Ctrl + S', '.maplet 파일 다운로드'],
          ['Space + 드래그', '캔버스 이동'],
          ['Ctrl + 휠 / 핀치', '확대·축소'],
          ['노드 드래그', '위치·연결선 길이 조절'],
        ].map(([key, action]) => (
          <div key={key}>
            <dt>
              <kbd>{key}</kbd>
            </dt>
            <dd>{action}</dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}
