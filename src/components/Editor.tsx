import { useI18n } from '../i18n/react';
import { useCallback, useRef, useState } from 'react';
import { FolderOpen, X } from 'lucide-react';
import { EditorHeader } from './EditorHeader';
import { EditorToolbar } from './EditorToolbar';
import { LanguageSwitcher } from './LanguageSwitcher';
import { SettingsDialog } from './SettingsDialog';
import { Canvas, type CanvasControls } from './Canvas';
import { NodeToolsDialog, type NodeTool } from './NodeToolsDialog';
import { NodeContextMenu } from './NodeContextMenu';
import { FindBar } from './FindBar';
import { useEditorView } from './useEditorView';
import type { EditorProps } from './editor-types';
export type { EditorProps } from './editor-types';

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
  const view = useEditorView(props, controls, setTool);
  const { actions, find } = view;
  const viewActions = view.canvasActions();
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
  const menuGroups = (at: { x: number; y: number }) => {
    const groups = view.canvasActions(at);
    return [groups.history, groups.edit, groups.levels, groups.display, groups.layout];
  };
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
        {t('editor.skipMindMap')}
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
        onExportOutline={props.onExportOutline}
        onPrint={props.onPrint}
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
        onArrange={command(view.arrangeMap)}
        openTool={setTool}
        onFind={find.show}
        viewActions={[viewActions.levels, viewActions.display]}
        command={command}
        controls={controls}
        zoom={zoom}
      />
      {props.error && (
        <div className="message error" role="alert">
          <span>{t(props.error)}</span>
          <button
            className="icon-button"
            aria-label={t('editor.dismissError')}
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
            aria-label={t('editor.dismissNotification')}
            onClick={props.onDismissNotice}
          >
            <X size={16} />
          </button>
        </div>
      )}
      <main className="workspace" id="workspace" tabIndex={-1}>
        {view.focus && (
          <div className="focus-banner" role="status">
            <span>
              {t('editor.focusedBranch', { title: map.nodes[view.focus].title.split('\n')[0] })}
            </span>
            <button type="button" className="text-button" onClick={view.exitFocus}>
              {t('common.showWholeMap')}
            </button>
          </div>
        )}
        {find.open && (
          <FindBar
            find={find}
            onClose={() => {
              find.close();
              focusNode(selected);
            }}
          />
        )}
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
          onToggleTask={props.onToggleTask}
          focusId={view.focus}
          matches={find.open ? find.matches : undefined}
          minimap={view.minimap}
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
          <span>{props.dirty ? t('common.unsavedChanges') : t('editor.noFileChanges')}</span>
          <span className="status-separator">·</span>
          <span title={t(props.draftStatus)}>{t(props.driveSaveStatus ?? props.draftStatus)}</span>
        </div>
        <div className="status-tools">
          {props.selection.length > 1 && (
            <span className="selection-count" role="status">
              {t('editor.selectedCount', { count: props.selection.length })}
            </span>
          )}
          <span className="node-count">
            {t('editor.nodeCount', { count: Object.keys(map.nodes).length })}
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
          onConnect={props.onConnect}
          onDisconnect={props.onDisconnect}
          onClose={closeTool}
        />
      )}
      {menu && map.nodes[selected] && (
        <NodeContextMenu
          groups={
            menu.canvas
              ? menuGroups(menu)
              : [
                  actions.create,
                  actions.tools,
                  actions.clipboard,
                  actions.arrange,
                  actions.view,
                  actions.remove,
                ]
          }
          label={menu.canvas ? 'editor.canvasMenu' : 'common.nodeMenu'}
          at={menu}
          onClose={closeMenu}
        />
      )}
      {dragging && (
        <div className="file-drop-overlay">
          <FolderOpen size={36} />
          <p>{t('editor.dropMapletMupMarkdownOpml')}</p>
        </div>
      )}
    </div>
  );
}
