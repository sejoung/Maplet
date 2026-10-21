import { useI18n } from '../i18n/react';
import type { RefObject } from 'react';
import {
  CircleHelp,
  Eye,
  Focus,
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
  WandSparkles,
} from 'lucide-react';
import type { MindMap } from '../domain/model';
import { canDeleteNodes } from '../domain/selection';
import { ToolbarMenu } from './ToolbarMenu';
import type { CanvasControls } from './canvas-types';
import { NodeActionItems, type NodeAction, type NodeActionGroups } from './node-actions';
import type { NodeTool } from './NodeToolsDialog';

export function EditorToolbar({
  map,
  selected,
  selection,
  actions,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onAdd,
  onDelete,
  onHelp,
  onArrange,
  openTool,
  onFind,
  viewActions,
  command,
  controls,
  zoom,
}: {
  map: MindMap;
  selected: string;
  selection: string[];
  actions: NodeActionGroups;
  canUndo: boolean;
  canRedo: boolean;
  onUndo(): void;
  onRedo(): void;
  onAdd(sibling?: boolean): void;
  onDelete(): void;
  onHelp(): void;
  onArrange(): void;
  openTool(tool: NodeTool): void;
  onFind(): void;
  viewActions: NodeAction[][];
  command(action: () => void): () => void;
  controls: RefObject<CanvasControls | null>;
  zoom: number;
}) {
  const { t } = useI18n();
  const node = map.nodes[selected];
  return (
    <div role="region" aria-label={t('toolbar.editingToolbar')}>
      <div className="editor-toolbar" role="toolbar" aria-label={t('toolbar.editingTools')}>
        <div className="toolbar-group">
          <button
            className="icon-button"
            aria-label={t('common.undo')}
            title={t('toolbar.undoCtrlCmdZ')}
            disabled={!canUndo}
            onClick={onUndo}
          >
            <Undo2 size={17} />
          </button>
          <button
            className="icon-button"
            aria-label={t('common.redo')}
            title={t('toolbar.redoCtrlCmdShiftZ')}
            disabled={!canRedo}
            onClick={onRedo}
          >
            <Redo2 size={17} />
          </button>
        </div>
        <span className="tool-divider" />
        <button
          className="tool-button add-node"
          aria-label={t('common.addChildNode')}
          title={t('toolbar.addChildNodeTab')}
          onClick={() => onAdd()}
        >
          <Plus size={17} />
          <span>{t('toolbar.childNode')}</span>
        </button>
        <button
          className="tool-button delete-node"
          aria-label={t('toolbar.deleteSelectedNode')}
          title={t('toolbar.deleteSelectedNodeTitle')}
          disabled={!canDeleteNodes(map, selection)}
          onClick={onDelete}
        >
          <Trash2 size={17} />
          <span>{t('toolbar.delete')}</span>
        </button>
        <ToolbarMenu
          label={t('toolbar.nodeActions')}
          icon={<SquarePen size={18} />}
          className="node-menu"
        >
          <NodeActionItems
            groups={[
              actions.create,
              actions.clipboard,
              actions.arrange,
              actions.view,
              actions.remove,
            ]}
            wrap={command}
          />
        </ToolbarMenu>
        <span className="tool-divider desktop-tool" />
        <button
          className="tool-button desktop-tool"
          aria-label={t('common.notes')}
          onClick={command(() => openTool('notes'))}
        >
          <MessageSquare size={16} />
          <span>{t('common.notes')}</span>
          {node.notes && <span className="tool-dot" />}
        </button>
        <button
          className="tool-button desktop-tool"
          aria-label={t('common.link')}
          onClick={command(() => openTool('link'))}
        >
          <Link2 size={16} />
          <span>{t('common.link')}</span>
        </button>
        <button
          className="tool-button desktop-tool"
          aria-label={t('common.style')}
          onClick={command(() => openTool('style'))}
        >
          <Palette size={16} />
          <span>{t('common.style')}</span>
        </button>
        <button
          className="tool-button desktop-tool"
          aria-label={t('common.find')}
          onClick={command(onFind)}
        >
          <Search size={16} />
          <span>{t('common.find')}</span>
        </button>
        <ToolbarMenu
          label={t('toolbar.more')}
          icon={<MoreHorizontal size={18} />}
          className="mobile-tools"
        >
          <button onClick={command(() => openTool('notes'))}>
            <MessageSquare size={16} />
            {t('common.notes')}
          </button>
          <button onClick={command(() => openTool('link'))}>
            <Link2 size={16} />
            {t('common.link')}
          </button>
          <button onClick={command(() => openTool('style'))}>
            <Palette size={16} />
            {t('common.style')}
          </button>
          <button onClick={command(onFind)}>
            <Search size={16} />
            {t('common.find')}
          </button>
          <hr />
          <button onClick={command(onHelp)} aria-label={t('toolbar.keyboardShortcuts')}>
            <CircleHelp size={16} />
            {t('toolbar.keyboardShortcuts')}
          </button>
        </ToolbarMenu>
        <ToolbarMenu label={t('toolbar.view')} icon={<Eye size={18} />} className="view-menu">
          <NodeActionItems groups={viewActions} wrap={command} />
        </ToolbarMenu>
        <button
          className="tool-button auto-layout-button"
          aria-label={t('toolbar.autoArrangeEntireMap')}
          title={t('toolbar.autoArrangeHint')}
          onClick={onArrange}
        >
          <WandSparkles size={17} />
          <span>{t('common.autoArrange')}</span>
        </button>
        <div className="zoom-tools">
          <button
            className="icon-button"
            aria-label={t('common.zoomOut')}
            title={t('common.zoomOut')}
            onClick={() => controls.current?.zoomOut()}
          >
            <Minus size={17} />
          </button>
          <output aria-label={t('toolbar.zoomLevel')}>{Math.round(zoom * 100)}%</output>
          <button
            className="icon-button"
            aria-label={t('common.zoomIn')}
            title={t('common.zoomIn')}
            onClick={() => controls.current?.zoomIn()}
          >
            <Plus size={17} />
          </button>
          <button
            className="icon-button"
            aria-label={t('common.fitScreen')}
            title={t('common.fitScreen')}
            onClick={() => controls.current?.fit()}
          >
            <Focus size={17} />
          </button>
        </div>
        <button
          className="icon-button help-button"
          aria-label={t('toolbar.keyboardShortcuts')}
          title={t('toolbar.keyboardShortcuts')}
          onClick={onHelp}
        >
          <CircleHelp size={17} />
        </button>
      </div>
    </div>
  );
}
