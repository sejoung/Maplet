import { useCallback, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  CaseSensitive,
  CircleHelp,
  Cloud,
  FilePlus2,
  Focus,
  FolderOpen,
  Link2,
  MessageSquare,
  Minus,
  MoreHorizontal,
  Palette,
  Plus,
  Redo2,
  Search,
  SquarePen,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { ToolbarMenu } from './ToolbarMenu';
import { Canvas, type CanvasProps, type CanvasControls } from './Canvas';
import { NodeToolsDialog, type NodeTool, type NodeToolActions } from './NodeToolsDialog';

export interface EditorProps
  extends Omit<CanvasProps, 'controlsRef' | 'onZoomChange'>, NodeToolActions {
  filename: string;
  dirty: boolean;
  draftStatus: string;
  error: string | null;
  notice: string | null;
  onAutoLayout(): void;
  onUndo(): void;
  onRedo(): void;
  canUndo: boolean;
  canRedo: boolean;
  onNew(): void;
  onOpen(file: File): void;
  onSave(): void;
  onBackup(): void;
  onHelp(): void;
  onDrive(): void;
  onDismissError(): void;
  onDismissNotice(): void;
}
export function Editor(props: EditorProps) {
  const { map, selected } = props;
  const node = map.nodes[selected];
  const input = useRef<HTMLInputElement>(null);
  const controls = useRef<CanvasControls>(null);
  const [zoom, setZoom] = useState(1);
  const [tool, setTool] = useState<NodeTool | null>(null);
  const [dragging, setDragging] = useState(false);
  const closeTool = useCallback(() => setTool(null), []);
  const command = (action: () => void) => () => {
    document
      .querySelectorAll<HTMLDetailsElement>('.toolbar-menu[open]')
      .forEach((menu) => (menu.open = false));
    action();
  };
  const focusNode = (id: string) =>
    requestAnimationFrame(() =>
      document.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(id)}"]`)?.focus(),
    );
  const openTool = (value: NodeTool) => command(() => setTool(value));
  return (
    <div
      className="editor-shell"
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('Files')) {
          event.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false);
      }}
      onDrop={(event) => {
        if (event.dataTransfer.files.length) {
          event.preventDefault();
          setDragging(false);
          props.onOpen(event.dataTransfer.files[0]);
        }
      }}
    >
      <a className="skip-link" href="#workspace">
        마인드맵으로 건너뛰기
      </a>
      <header className="app-header">
        <h1 className="visually-hidden">Maplet 마인드맵 편집기</h1>
        <div className="brand">
          <img src={`${import.meta.env.BASE_URL}icon.svg`} width="25" height="25" alt="" />
          <span>Maplet</span>
        </div>
        <ToolbarMenu label="파일">
          <button onClick={command(props.onNew)}>
            <FilePlus2 size={17} />새 맵
          </button>
          <button onClick={command(() => input.current?.click())}>
            <FolderOpen size={17} />
            열기
          </button>
          <button onClick={command(props.onSave)}>
            <ArrowDownToLine size={17} />
            .mup 저장
          </button>
          {map.original && (
            <button onClick={command(props.onBackup)}>
              <ArrowDownToLine size={17} />
              원본 백업 다운로드
            </button>
          )}
          <hr />
          <button onClick={command(props.onDrive)}>
            <Cloud size={17} />
            Google Drive
          </button>
        </ToolbarMenu>
        <div className="document-name" title={props.filename}>
          <span>{props.filename.replace(/\.mup$/i, '')}</span>
          {props.dirty && (
            <span className="unsaved-marker" aria-label="저장하지 않은 변경">
              •
            </span>
          )}
        </div>
        <button className="button primary save-button" onClick={props.onSave}>
          <ArrowDownToLine size={16} />
          <span>.mup 저장</span>
        </button>
        <input
          ref={input}
          type="file"
          accept=".mup,.json,application/json"
          aria-label="마인드맵 파일 열기"
          className="visually-hidden"
          tabIndex={-1}
          onChange={(event) => {
            if (event.target.files?.[0]) props.onOpen(event.target.files[0]);
            event.target.value = '';
          }}
        />
      </header>
      <div role="region" aria-label="편집 도구 모음">
        <div className="editor-toolbar" role="toolbar" aria-label="편집 도구">
          <div className="toolbar-group">
            <button
              className="icon-button"
              aria-label="실행 취소"
              title="실행 취소 (Ctrl/⌘ Z)"
              disabled={!props.canUndo}
              onClick={props.onUndo}
            >
              <Undo2 size={17} />
            </button>
            <button
              className="icon-button"
              aria-label="다시 실행"
              title="다시 실행 (Ctrl/⌘ Shift Z)"
              disabled={!props.canRedo}
              onClick={props.onRedo}
            >
              <Redo2 size={17} />
            </button>
          </div>
          <span className="tool-divider" />
          <button
            className="tool-button add-node"
            aria-label="하위 노드 추가"
            title="하위 노드 추가 (Tab)"
            onClick={() => props.onAdd()}
          >
            <Plus size={17} />
            <span>하위 노드</span>
          </button>
          <ToolbarMenu label="노드 작업" icon={<SquarePen size={18} />} className="node-menu">
            <button onClick={command(() => props.onEdit())}>
              <CaseSensitive size={17} />
              제목 편집<kbd>F2</kbd>
            </button>
            <button onClick={command(() => props.onAdd(true))}>
              <Plus size={17} />
              형제 노드 추가<kbd>Enter</kbd>
            </button>
            <button
              onClick={command(() => props.onToggle(selected))}
              disabled={!node.children.length}
            >
              {node.collapsed ? '펼치기' : '접기'}
            </button>
            <hr />
            <button disabled={node.parentId === null} onClick={openTool('move')}>
              노드 이동
            </button>
            <button
              disabled={node.parentId === null}
              onClick={command(() => props.onUpdate(selected, { side: 'left' }))}
            >
              <ArrowLeft size={17} />
              왼쪽 배치
            </button>
            <button
              disabled={node.parentId === null}
              onClick={command(() => props.onUpdate(selected, { side: 'right' }))}
            >
              <ArrowRight size={17} />
              오른쪽 배치
            </button>
            <hr />
            <button onClick={command(props.onAutoLayout)}>
              <Focus size={17} />맵 자동 정렬
            </button>
            <button
              className="danger-quiet"
              disabled={node.parentId === null && map.roots.length === 1}
              onClick={command(props.onDelete)}
            >
              <Trash2 size={17} />
              노드 삭제
            </button>
          </ToolbarMenu>
          <span className="tool-divider desktop-tool" />
          <button
            className="tool-button desktop-tool"
            aria-label="메모"
            onClick={openTool('notes')}
          >
            <MessageSquare size={16} />
            <span>메모</span>
            {node.notes && <span className="tool-dot" />}
          </button>
          <button className="tool-button desktop-tool" aria-label="링크" onClick={openTool('link')}>
            <Link2 size={16} />
            <span>링크</span>
          </button>
          <button
            className="tool-button desktop-tool"
            aria-label="서식"
            onClick={openTool('style')}
          >
            <Palette size={16} />
            <span>서식</span>
          </button>
          <button
            className="tool-button desktop-tool"
            aria-label="찾기"
            onClick={openTool('search')}
          >
            <Search size={16} />
            <span>찾기</span>
          </button>
          <ToolbarMenu label="더보기" icon={<MoreHorizontal size={18} />} className="mobile-tools">
            <button onClick={openTool('notes')}>
              <MessageSquare size={16} />
              메모
            </button>
            <button onClick={openTool('link')}>
              <Link2 size={16} />
              링크
            </button>
            <button onClick={openTool('style')}>
              <Palette size={16} />
              서식
            </button>
            <button onClick={openTool('search')}>
              <Search size={16} />
              찾기
            </button>
            <hr />
            <button onClick={command(props.onHelp)} aria-label="단축키 도움말">
              <CircleHelp size={16} />
              단축키 도움말
            </button>
          </ToolbarMenu>
          <div className="zoom-tools">
            <button
              className="icon-button"
              aria-label="축소"
              title="축소"
              onClick={() => controls.current?.zoomOut()}
            >
              <Minus size={17} />
            </button>
            <output aria-label="확대 비율">{Math.round(zoom * 100)}%</output>
            <button
              className="icon-button"
              aria-label="확대"
              title="확대"
              onClick={() => controls.current?.zoomIn()}
            >
              <Plus size={17} />
            </button>
            <button
              className="icon-button"
              aria-label="화면에 맞추기"
              title="화면에 맞추기"
              onClick={() => controls.current?.fit()}
            >
              <Focus size={17} />
            </button>
          </div>
          <button
            className="icon-button help-button"
            aria-label="단축키 도움말"
            title="단축키 도움말"
            onClick={props.onHelp}
          >
            <CircleHelp size={17} />
          </button>
        </div>
      </div>
      {props.error && (
        <div className="message error" role="alert">
          <span>{props.error}</span>
          <button className="icon-button" aria-label="오류 닫기" onClick={props.onDismissError}>
            <X size={16} />
          </button>
        </div>
      )}
      {props.notice && (
        <div className="message notice" role="status">
          <span>{props.notice}</span>
          <button className="icon-button" aria-label="안내 닫기" onClick={props.onDismissNotice}>
            <X size={16} />
          </button>
        </div>
      )}
      <main className="workspace" id="workspace" tabIndex={-1}>
        <Canvas {...props} controlsRef={controls} onZoomChange={setZoom} />
      </main>
      <footer className="status-bar">
        <div className="save-status" role="status">
          <span className={`status-dot ${props.dirty ? 'pending' : ''}`} />
          <span>{props.dirty ? '저장하지 않은 변경' : '파일 변경 없음'}</span>
          <span className="status-separator">·</span>
          <span>{props.draftStatus}</span>
        </div>
        <span className="node-count">노드 {Object.keys(map.nodes).length}개</span>
      </footer>
      {tool && (
        <NodeToolsDialog
          key={`${tool}:${selected}`}
          tool={tool}
          map={map}
          selected={selected}
          onUpdate={props.onUpdate}
          onMove={props.onMove}
          onSelect={(id) => {
            props.onSelect(id);
            focusNode(id);
          }}
          onClose={closeTool}
        />
      )}
      {dragging && (
        <div className="file-drop-overlay">
          <FolderOpen size={36} />
          <p>.mup 파일을 놓아 열기</p>
        </div>
      )}
    </div>
  );
}
