import { useI18n } from '../../i18n/react';
import { useCallback, useRef, useState } from 'react';
import { FolderOpen } from 'lucide-react';
import { EditorHeader } from './EditorHeader';
import { EditorToolbar } from './EditorToolbar';
import { SettingsDialog } from '../dialogs/SettingsDialog';
import { Canvas, type CanvasControls } from '../canvas/Canvas';
import { NodeToolsDialog, type NodeTool } from '../dialogs/node-tools/NodeToolsDialog';
import { NodeContextMenu } from '../menus/NodeContextMenu';
import { FindBar } from './find/FindBar';
import { DeletedToast, MessageBanner } from './MessageBanner';
import { StatusBar } from './StatusBar';
import { useEditorView } from './useEditorView';
import { useFileDrop } from './useFileDrop';
import { useTextEditorFocus } from './useTextEditorFocus';
import type { EditorProps } from './editor-types';
import { plainTitle } from '../../domain/rich-text/rich-text';
import { createRichEditorBridge, RichEditorContext } from '../rich-text/rich-editor-bridge';
import { focusNodeLater } from '../canvas/canvas-dom';
export type { EditorProps } from './editor-types';

export function Editor(props: EditorProps) {
  const { t } = useI18n();
  const { map, selected } = props;
  const controls = useRef<CanvasControls>(null);
  const [zoom, setZoom] = useState(1);
  const [tool, setTool] = useState<NodeTool | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [richEditor] = useState(createRichEditorBridge);
  const [menu, setMenu] = useState<{ x: number; y: number; canvas?: boolean } | null>(null);
  const drop = useFileDrop(props.onOpen);
  const textEditor = useTextEditorFocus();
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const closeTool = useCallback(() => setTool(null), []);
  const view = useEditorView(props, controls, setTool);
  const { actions, find } = view;
  const closeMenu = useCallback(
    (restoreFocus: boolean) => {
      setMenu(null);
      if (restoreFocus) focusNodeLater(selected);
    },
    [selected],
  );
  const menuGroups = (at: { x: number; y: number; canvas?: boolean }) => {
    if (!at.canvas)
      return [
        actions.create,
        actions.tools,
        actions.clipboard,
        actions.arrange,
        actions.view,
        actions.remove,
      ];
    const groups = view.canvasActions(at);
    return [groups.history, groups.edit, groups.levels, groups.display, groups.layout];
  };
  return (
    <RichEditorContext.Provider value={richEditor}>
      <div className="editor-shell" {...textEditor.handlers} {...drop.handlers}>
        <a className="skip-link" href="#workspace">
          {t('editor.skipMindMap')}
        </a>
        <EditorHeader
          {...props}
          original={map.original}
          editingText={textEditor.editing || Boolean(props.editingId)}
          onSettings={() => setSettingsOpen(true)}
        />
        <EditorToolbar
          map={map}
          selection={props.selection}
          actions={actions}
          canvas={view.canvasActions()}
          zoom={zoom}
          onHelp={props.onHelp}
          onFormatNodes={props.onFormatNodes}
        />
        {props.error && (
          <MessageBanner kind="error" message={props.error} onDismiss={props.onDismissError} />
        )}
        {props.notice && (
          <MessageBanner kind="notice" message={props.notice} onDismiss={props.onDismissNotice} />
        )}
        <main className="workspace" id="workspace" tabIndex={-1}>
          {view.focus && (
            <div className="focus-banner" role="status">
              <span>
                {t('editor.focusedBranch', {
                  title: plainTitle(map.nodes[view.focus].title).split('\n')[0],
                })}
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
                focusNodeLater(selected);
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
            onFormatNodes={props.onFormatNodes}
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
          {props.deletedNotice && <DeletedToast {...props.deletedNotice} />}
        </main>
        <StatusBar
          dirty={props.dirty}
          draftStatus={props.draftStatus}
          driveSaveStatus={props.driveSaveStatus}
          selectedCount={props.selection.length}
          nodeCount={Object.keys(map.nodes).length}
        />
        {settingsOpen && (
          <SettingsDialog onClose={closeSettings} draftPrivacy={props.draftPrivacy} />
        )}
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
            groups={menuGroups(menu)}
            label={menu.canvas ? 'editor.canvasMenu' : 'common.nodeMenu'}
            at={menu}
            onClose={closeMenu}
          />
        )}
        {drop.dragging && (
          <div className="file-drop-overlay">
            <FolderOpen size={36} />
            <p>{t('editor.dropMapletMupMarkdownOpml')}</p>
          </div>
        )}
      </div>
    </RichEditorContext.Provider>
  );
}
