import { useI18n } from '../i18n/react';
import { CircleHelp, Eye, Minus, MoreHorizontal, Plus, SquarePen } from 'lucide-react';
import type { MindMap } from '../domain/model';
import type { FormatCommand } from '../domain/rich-text';
import { ToolbarMenu } from './ToolbarMenu';
import { ToolbarButton } from './ToolbarButton';
import { findAction, MenuItems, withoutShortcut, type MenuAction } from './menu-actions';
import type { CanvasActionGroups, NodeActionGroups } from './node-actions';
import { FormatTools } from './FormatTools';

/** The editing toolbar, built from the same actions as the node and canvas menus. */
export function EditorToolbar({
  map,
  selection,
  actions,
  canvas,
  zoom,
  onHelp,
  onFormatNodes,
}: {
  map: MindMap;
  selection: string[];
  actions: NodeActionGroups;
  canvas: CanvasActionGroups;
  zoom: number;
  onHelp(): void;
  onFormatNodes(command: FormatCommand): void;
}) {
  const { t } = useI18n();
  const node = (id: string) => findAction(actions, id);
  const view = (id: string) => findAction(canvas, id);
  const [undo, redo] = canvas.history;
  // Shown as buttons on wide screens and gathered under More on narrow ones.
  const quick = [node('notes'), node('link'), node('style'), view('find')];
  const help: MenuAction = {
    id: 'help',
    label: t('toolbar.keyboardShortcuts'),
    icon: CircleHelp,
    run: onHelp,
  };
  const arrange = view('autoArrange');
  return (
    <div role="region" aria-label={t('toolbar.editingToolbar')}>
      <div className="editor-toolbar" role="toolbar" aria-label={t('toolbar.editingTools')}>
        <div className="toolbar-group">
          <ToolbarButton action={undo} hint />
          <ToolbarButton action={redo} hint />
        </div>
        <span className="tool-divider" />
        <ToolbarButton action={node('addChild')} labelled hint className="add-node" />
        <ToolbarButton
          action={node('delete')}
          labelled
          hint
          label={t('toolbar.deleteSelectedNode')}
          className="delete-node"
        />
        <ToolbarMenu label={t('toolbar.nodeActions')} icon={SquarePen} className="node-menu">
          <MenuItems
            groups={[
              actions.create,
              actions.clipboard,
              actions.arrange,
              actions.view,
              actions.remove,
            ]}
          />
        </ToolbarMenu>
        <span className="tool-divider" />
        <FormatTools map={map} selection={selection} onFormatNodes={onFormatNodes} />
        <span className="tool-divider desktop-tool" />
        {quick.map((action) => (
          <ToolbarButton key={action.id} action={action} labelled className="desktop-tool" />
        ))}
        <ToolbarMenu label={t('toolbar.more')} icon={MoreHorizontal} className="mobile-tools">
          <MenuItems groups={[quick.map(withoutShortcut), [help]]} />
        </ToolbarMenu>
        <ToolbarMenu label={t('toolbar.view')} icon={Eye} className="view-menu">
          <MenuItems groups={[canvas.levels, canvas.display]} />
        </ToolbarMenu>
        <ToolbarButton
          action={arrange}
          labelled
          label={t('toolbar.autoArrangeEntireMap')}
          title={t('toolbar.autoArrangeHint')}
          className="auto-layout-button"
        />
        <div className="zoom-tools">
          <ToolbarButton action={view('zoomOut')} icon={Minus} />
          <output aria-label={t('toolbar.zoomLevel')}>{Math.round(zoom * 100)}%</output>
          <ToolbarButton action={view('zoomIn')} icon={Plus} />
          <ToolbarButton action={view('fit')} />
        </div>
        <ToolbarButton action={help} className="help-button" />
      </div>
    </div>
  );
}
