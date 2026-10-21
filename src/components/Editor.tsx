import { useI18n } from '../i18n/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FolderOpen, X } from 'lucide-react';
import { EditorHeader } from './EditorHeader';
import { EditorToolbar } from './EditorToolbar';
import { LanguageSwitcher } from './LanguageSwitcher';
import { SettingsDialog } from './SettingsDialog';
import { useAutoArrange } from './useAutoArrange';
import { Canvas, type CanvasControls } from './Canvas';
import { NodeToolsDialog, type NodeTool } from './NodeToolsDialog';
import { NodeContextMenu } from './NodeContextMenu';
import { canvasActionGroups, nodeActionGroups } from './node-actions';
import { visibleSelection } from '../domain/selection';
import type { EditorProps } from './editor-types';
export type { EditorProps } from './editor-types';

const editable = (target: EventTarget | null) =>
  target instanceof Element &&
  Boolean(target.closest('input,textarea,select,[contenteditable=true]'));

export function Editor(props: EditorProps) {
  const { t } = useI18n();
  const { map, selected } = props;
  const controls = useRef<CanvasControls>(null);
  const [zoom, setZoom] = useState(1);
  const [tool, setTool] = useState<NodeTool | null>(null);
  const [dragging, setDragging] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editingText, setEditingText] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; canvas?: boolean } | null>(null);
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
  const closeMenu = useCallback(
    (restoreFocus: boolean) => {
      setMenu(null);
      if (restoreFocus) focusNode(selected);
    },
    [selected],
  );
  // Menu commands have no clipboard event, so they also offer the text to other apps.
  const share = (text: string | null) => {
    if (text) void navigator.clipboard?.writeText(text).catch(() => {});
  };
  const actions = nodeActionGroups(
    map,
    selected,
    {
      onAdd: props.onAdd,
      onEdit: (id) => props.onEdit(id),
      onDelete: props.onDelete,
      onToggle: props.onToggle,
      onSide: (id, side) => props.onUpdate(id, { side }),
      onCopy: (id) => share(props.onCopyNode(id)),
      onCut: (id) => share(props.onCutNode(id)),
      onPaste: (id) => props.onPasteNode(id),
      onDuplicate: props.onDuplicateNode,
      onReorder: props.onReorder,
      openTool: setTool,
      canPaste: props.canPaste,
    },
    t,
    props.selection,
  );
  const arrangeMap = useAutoArrange(map, props.onAutoLayout, controls);
  const canvasActions = canvasActionGroups(
    {
      onUndo: props.onUndo,
      onRedo: props.onRedo,
      canUndo: props.canUndo,
      canRedo: props.canRedo,
      onPaste: () => props.onPasteNode(selected),
      canPaste: props.canPaste,
      onSelectAll: () =>
        props.onSelectNodes(visibleSelection(map, Object.keys(map.nodes)), selected),
      onSearch: () => setTool('search'),
      onArrange: arrangeMap,
      onFit: () => controls.current?.fit(),
      onZoomIn: () => controls.current?.zoomIn(),
      onZoomOut: () => controls.current?.zoomOut(),
    },
    t,
  );
  // Canvas apps zoom the document, not the browser page, with Ctrl/⌘ +, − and 0.
  useEffect(() => {
    const zoomKeys = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || editable(event.target)) return;
      const view = controls.current;
      const run = { '=': view?.zoomIn, '+': view?.zoomIn, '-': view?.zoomOut, '0': view?.fit }[
        event.key
      ];
      if (!run) return;
      event.preventDefault();
      run();
    };
    window.addEventListener('keydown', zoomKeys);
    return () => window.removeEventListener('keydown', zoomKeys);
  }, []);
  return (
    <div
      className="editor-shell"
      onFocusCapture={(event) =>
        setEditingText(event.target.matches('[data-inline-editor],[data-filename-editor]'))
      }
      onBlurCapture={(event) => {
        if (event.target.matches('[data-inline-editor],[data-filename-editor]'))
          setEditingText(false);
      }}
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
        filename={props.filename}
        documentKey={props.documentKey}
        onFilenameChange={props.onFilenameChange}
        dirty={props.dirty}
        original={map.original}
        driveConfigured={props.driveConfigured}
        driveConnected={props.driveConnected}
        driveBusy={props.driveBusy}
        driveSync={props.driveSync}
        saveToDrive={props.saveToDrive}
        canSaveCopy={props.canSaveCopy}
        editingText={editingText || Boolean(props.editingId)}
        onNew={props.onNew}
        onOpen={props.onOpen}
        onOpenDrive={props.onOpenDrive}
        onSave={props.onSave}
        onSaveCopy={props.onSaveCopy}
        onDownload={props.onDownload}
        onExportMup={props.onExportMup}
        onBackup={props.onBackup}
        onExportImage={props.onExportImage}
        onDrive={props.onDrive}
        onSettings={() => setSettingsOpen(true)}
        command={command}
      />
      <EditorToolbar
        map={map}
        selected={selected}
        selection={props.selection}
        actions={actions}
        canUndo={props.canUndo}
        canRedo={props.canRedo}
        onUndo={props.onUndo}
        onRedo={props.onRedo}
        onAdd={props.onAdd}
        onDelete={props.onDelete}
        onHelp={props.onHelp}
        onArrange={command(arrangeMap)}
        openTool={setTool}
        command={command}
        controls={controls}
        zoom={zoom}
      />
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
        <Canvas
          map={map}
          selected={selected}
          selection={props.selection}
          documentKey={props.documentKey}
          onSelect={props.onSelect}
          onToggleSelect={props.onToggleSelect}
          onSelectNodes={props.onSelectNodes}
          onEdit={props.onEdit}
          editingId={props.editingId}
          onRename={props.onRename}
          onCancelEdit={props.onCancelEdit}
          onAdd={props.onAdd}
          onDelete={props.onDelete}
          onToggle={props.onToggle}
          onResize={props.onResize}
          onReposition={props.onReposition}
          onReparent={props.onReparent}
          onContextMenu={(id, at) => {
            // Right-clicking inside a group keeps it, so menu commands act on every node.
            if (!props.selection.includes(id)) props.onSelect(id);
            setMenu(at);
          }}
          onCanvasMenu={(at) => setMenu({ ...at, canvas: true })}
          onCopy={props.onCopyNode}
          onCut={props.onCutNode}
          onPaste={props.onPasteNode}
          onDuplicate={props.onDuplicateNode}
          onReorder={props.onReorder}
          controlsRef={controls}
          onZoomChange={setZoom}
        />
      </main>
      <footer className="status-bar">
        <div
          className="save-status"
          role="status"
          aria-live={props.driveSaveStatus ? 'off' : 'polite'}
        >
          <span className={`status-dot ${props.dirty ? 'pending' : ''}`} />
          <span>{props.dirty ? t('저장하지 않은 변경') : t('파일 변경 없음')}</span>
          <span className="status-separator">·</span>
          <span title={t(props.draftStatus)}>{t(props.driveSaveStatus ?? props.draftStatus)}</span>
        </div>
        <div className="status-tools">
          {props.selection.length > 1 && (
            <span className="selection-count" role="status">
              {t('{count}개 선택됨', { count: props.selection.length })}
            </span>
          )}
          <span className="node-count">
            {t('노드 {count}개', { count: Object.keys(map.nodes).length })}
          </span>
          <LanguageSwitcher />
        </div>
      </footer>
      {settingsOpen && <SettingsDialog onClose={closeSettings} draftPrivacy={props.draftPrivacy} />}
      {tool && (
        <NodeToolsDialog
          key={`${tool}:${selected}`}
          tool={tool}
          map={map}
          selected={selected}
          selection={props.selection}
          onUpdate={props.onUpdate}
          onMove={props.onMove}
          onSelect={(id) => {
            props.onSelect(id);
            focusNode(id);
          }}
          onClose={closeTool}
        />
      )}
      {menu && map.nodes[selected] && (
        <NodeContextMenu
          groups={
            menu.canvas
              ? canvasActions
              : [actions.create, actions.tools, actions.clipboard, actions.arrange, actions.remove]
          }
          label={menu.canvas ? '캔버스 메뉴' : '노드 메뉴'}
          at={menu}
          onClose={closeMenu}
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
