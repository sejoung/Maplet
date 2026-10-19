import { useI18n } from '../i18n/react';
import { useCallback, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CaseSensitive,
  CircleHelp,
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
import { EditorHeader } from './EditorHeader';
import { LanguageSwitcher } from './LanguageSwitcher';
import { SettingsDialog } from './SettingsDialog';
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
  onExportMup(): void;
  onBackup(): void;
  onHelp(): void;
  onDrive(): void;
  driveConnected: boolean;
  driveBusy: boolean;
  driveSaveStatus: string | null;
  onDismissError(): void;
  onDismissNotice(): void;
}
export function Editor(props: EditorProps) {
  const { t } = useI18n();
  const { map, selected } = props;
  const node = map.nodes[selected];
  const controls = useRef<CanvasControls>(null);
  const [zoom, setZoom] = useState(1);
  const [tool, setTool] = useState<NodeTool | null>(null);
  const [dragging, setDragging] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
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
        {t('마인드맵으로 건너뛰기')}
      </a>
      <EditorHeader
        {...props}
        original={map.original}
        command={command}
        onSettings={() => setSettingsOpen(true)}
      />
      <div role="region" aria-label={t('편집 도구 모음')}>
        <div className="editor-toolbar" role="toolbar" aria-label={t('편집 도구')}>
          <div className="toolbar-group">
            <button
              className="icon-button"
              aria-label={t('실행 취소')}
              title={t('실행 취소 (Ctrl/⌘ Z)')}
              disabled={!props.canUndo}
              onClick={props.onUndo}
            >
              <Undo2 size={17} />
            </button>
            <button
              className="icon-button"
              aria-label={t('다시 실행')}
              title={t('다시 실행 (Ctrl/⌘ Shift Z)')}
              disabled={!props.canRedo}
              onClick={props.onRedo}
            >
              <Redo2 size={17} />
            </button>
          </div>
          <span className="tool-divider" />
          <button
            className="tool-button add-node"
            aria-label={t('하위 노드 추가')}
            title={t('하위 노드 추가 (Tab)')}
            onClick={() => props.onAdd()}
          >
            <Plus size={17} />
            <span>{t('하위 노드')}</span>
          </button>
          <ToolbarMenu label={t('노드 작업')} icon={<SquarePen size={18} />} className="node-menu">
            <button onClick={command(() => props.onEdit())}>
              <CaseSensitive size={17} />
              {t('제목 편집')}
              <kbd>F2</kbd>
            </button>
            <button onClick={command(() => props.onAdd(true))}>
              <Plus size={17} />
              {t('형제 노드 추가')}
              <kbd>Enter</kbd>
            </button>
            <button
              onClick={command(() => props.onToggle(selected))}
              disabled={!node.children.length}
            >
              {node.collapsed ? t('펼치기') : t('접기')}
            </button>
            <hr />
            <button disabled={node.parentId === null} onClick={openTool('move')}>
              {t('노드 이동')}
            </button>
            <button
              disabled={node.parentId === null}
              onClick={command(() => props.onUpdate(selected, { side: 'left' }))}
            >
              <ArrowLeft size={17} />
              {t('왼쪽 배치')}
            </button>
            <button
              disabled={node.parentId === null}
              onClick={command(() => props.onUpdate(selected, { side: 'right' }))}
            >
              <ArrowRight size={17} />
              {t('오른쪽 배치')}
            </button>
            <hr />
            <button onClick={command(props.onAutoLayout)}>
              <Focus size={17} />
              {t('맵 자동 정렬')}
            </button>
            <button
              className="danger-quiet"
              disabled={node.parentId === null && map.roots.length === 1}
              onClick={command(props.onDelete)}
            >
              <Trash2 size={17} />
              {t('노드 삭제')}
            </button>
          </ToolbarMenu>
          <span className="tool-divider desktop-tool" />
          <button
            className="tool-button desktop-tool"
            aria-label={t('메모')}
            onClick={openTool('notes')}
          >
            <MessageSquare size={16} />
            <span>{t('메모')}</span>
            {node.notes && <span className="tool-dot" />}
          </button>
          <button
            className="tool-button desktop-tool"
            aria-label={t('링크')}
            onClick={openTool('link')}
          >
            <Link2 size={16} />
            <span>{t('링크')}</span>
          </button>
          <button
            className="tool-button desktop-tool"
            aria-label={t('서식')}
            onClick={openTool('style')}
          >
            <Palette size={16} />
            <span>{t('서식')}</span>
          </button>
          <button
            className="tool-button desktop-tool"
            aria-label={t('찾기')}
            onClick={openTool('search')}
          >
            <Search size={16} />
            <span>{t('찾기')}</span>
          </button>
          <ToolbarMenu
            label={t('더보기')}
            icon={<MoreHorizontal size={18} />}
            className="mobile-tools"
          >
            <button onClick={openTool('notes')}>
              <MessageSquare size={16} />
              {t('메모')}
            </button>
            <button onClick={openTool('link')}>
              <Link2 size={16} />
              {t('링크')}
            </button>
            <button onClick={openTool('style')}>
              <Palette size={16} />
              {t('서식')}
            </button>
            <button onClick={openTool('search')}>
              <Search size={16} />
              {t('찾기')}
            </button>
            <hr />
            <button onClick={command(props.onHelp)} aria-label={t('단축키 도움말')}>
              <CircleHelp size={16} />
              {t('단축키 도움말')}
            </button>
          </ToolbarMenu>
          <div className="zoom-tools">
            <button
              className="icon-button"
              aria-label={t('축소')}
              title={t('축소')}
              onClick={() => controls.current?.zoomOut()}
            >
              <Minus size={17} />
            </button>
            <output aria-label={t('확대 비율')}>{Math.round(zoom * 100)}%</output>
            <button
              className="icon-button"
              aria-label={t('확대')}
              title={t('확대')}
              onClick={() => controls.current?.zoomIn()}
            >
              <Plus size={17} />
            </button>
            <button
              className="icon-button"
              aria-label={t('화면에 맞추기')}
              title={t('화면에 맞추기')}
              onClick={() => controls.current?.fit()}
            >
              <Focus size={17} />
            </button>
          </div>
          <button
            className="icon-button help-button"
            aria-label={t('단축키 도움말')}
            title={t('단축키 도움말')}
            onClick={props.onHelp}
          >
            <CircleHelp size={17} />
          </button>
        </div>
      </div>
      {props.error && (
        <div className="message error" role="alert">
          <span>{t(props.error)}</span>
          <button
            className="icon-button"
            aria-label={t('오류 닫기')}
            onClick={props.onDismissError}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {props.notice && (
        <div className="message notice" role="status">
          <span>{t(props.notice)}</span>
          <button
            className="icon-button"
            aria-label={t('안내 닫기')}
            onClick={props.onDismissNotice}
          >
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
          <span>{props.dirty ? t('저장하지 않은 변경') : t('파일 변경 없음')}</span>
          <span className="status-separator">·</span>
          <span title={t(props.draftStatus)}>{t(props.driveSaveStatus ?? props.draftStatus)}</span>
        </div>
        <div className="status-tools">
          <span className="node-count">
            {t('노드 {count}개', { count: Object.keys(map.nodes).length })}
          </span>
          <LanguageSwitcher />
        </div>
      </footer>
      {settingsOpen && <SettingsDialog onClose={closeSettings} />}
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
          <p>{t('.maplet 또는 .mup 파일을 놓아 열기')}</p>
        </div>
      )}
    </div>
  );
}
