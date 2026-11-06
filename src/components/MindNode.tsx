import { memo, type ButtonHTMLAttributes, type MouseEvent } from 'react';
import type { MindNode as NodeData, NodePosition, Side } from '../domain/model';
import { nodeBorder, readableBackground } from '../domain/node-colors';
import { plainTitle } from '../domain/rich-text';
import { effectiveTitle } from '../domain/title-format';
import { nodeTypography } from '../domain/typography';
import type { MeasuredRun } from '../engine/node-measure';
import { markerMetrics } from '../engine/render-metrics';
import { useI18n } from '../i18n/react';
import { anchorBelow, menuAnchor } from './canvas-dom';
import { InlineNodeEditor } from './InlineNodeEditor';
import { nodeClassNames, nodeStyle } from './node-presentation';
import { CollapseButton, NodeBadges, NodeMarkers, ResizeHandle } from './NodeParts';
import { RichLine } from './RichLine';

/**
 * What a node can ask of the canvas. One stable object for every node, so a node only
 * re-renders when its own data or state changes.
 */
export interface NodeActions {
  /** The node received focus (keyboard, click or script). */
  focus(id: string): void;
  click(id: string, additive: boolean): void;
  edit(id: string): void;
  contextMenu(id: string, at: NodePosition): void;
  toggle(id: string): void;
  toggleTask(id: string): void;
  draftChange(id: string, title: string): void;
  commit(id: string, title: string, restoreFocus: boolean): boolean;
  cancelEdit(id: string, restoreFocus: boolean): void;
  /** Tab in the title editor: add the next node once the edit is saved. */
  addNext(): void;
  resizeHandle(id: string): ButtonHTMLAttributes<HTMLButtonElement>;
}

export interface MindNodeProps {
  node: NodeData;
  /** Laid-out box, passed as numbers: drag frames rebuild every layout entry. */
  x: number;
  y: number;
  width: number;
  height: number;
  side: Side;
  runs: MeasuredRun[][];
  depth: number;
  /** The keyboard tab stop: the primary selected node. */
  focused: boolean;
  chosen: boolean;
  multi: boolean;
  editing: boolean;
  dragging: boolean;
  drop: 'child' | 'sibling' | null;
  match: boolean;
  resizable: boolean;
  resizeHelpId: string;
  actions: NodeActions;
}

const additive = (event: MouseEvent) => event.shiftKey || event.metaKey || event.ctrlKey;

/** One node on the canvas: markers, title (or its editor), badges and controls. */
export const MindNode = memo(function MindNode(props: MindNodeProps) {
  const { t } = useI18n();
  const { node, editing, chosen, actions } = props;
  const { id } = node;
  // While editing, whole-node emphasis lives in the editor's text instead.
  const typography = nodeTypography(
    editing ? { ...node.style, fontWeight: null, fontStyle: null } : node.style,
  );
  const label = plainTitle(node.title);
  const markers = markerMetrics(node.style, typography.fontSize);
  const background = readableBackground(node.style.background, '');
  return (
    // Keys bubble to the canvas's one keyboard handler, which acts on the focused node.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events
    <div
      className={nodeClassNames({
        root: node.parentId === null,
        chosen,
        multi: props.multi,
        dragging: props.dragging,
        drop: props.drop,
        match: props.match,
        taskDone: markers.task === 'done',
        bold: typography.bold,
        customBackground: Boolean(background),
      })}
      role="treeitem"
      aria-label={label}
      aria-level={props.depth}
      aria-selected={chosen}
      data-drop-label={props.drop === 'child' ? t('canvas.moveHere') : undefined}
      aria-expanded={node.children.length ? !node.collapsed : undefined}
      tabIndex={props.focused ? 0 : -1}
      data-node-id={id}
      draggable={false}
      style={nodeStyle(props, typography, { border: nodeBorder(node.style), background })}
      onFocus={() => actions.focus(id)}
      onMouseDown={(event) => {
        // Keep focus where it is so the click can extend the selection instead.
        if (!editing && additive(event)) event.preventDefault();
      }}
      onClick={(event) => {
        // While the title is edited, clicks belong to the text, not to node selection.
        if (!editing) actions.click(id, additive(event));
      }}
      onDoubleClick={() => {
        if (!editing) actions.edit(id);
      }}
      onDragStart={(event) => event.preventDefault()}
      onContextMenu={(event) => {
        if (editing) return;
        event.preventDefault();
        const rect = event.currentTarget.getBoundingClientRect();
        actions.contextMenu(id, menuAnchor(event, anchorBelow(rect)));
      }}
    >
      <NodeMarkers
        markers={markers}
        fontSize={typography.fontSize}
        label={label}
        onToggleTask={() => actions.toggleTask(id)}
      />
      {editing ? (
        <InlineNodeEditor
          key={id}
          title={effectiveTitle(node)}
          storedTitle={node.title}
          lines={props.runs.length}
          lineHeight={typography.lineHeight}
          onDraftChange={(title) => actions.draftChange(id, title)}
          onCommit={(title, restoreFocus) => actions.commit(id, title, restoreFocus)}
          onCancel={(restoreFocus) => actions.cancelEdit(id, restoreFocus)}
          onAdd={actions.addNext}
        />
      ) : (
        <span className="node-text">
          {props.runs.map((runs, index) => (
            <RichLine key={index} runs={runs} />
          ))}
        </span>
      )}
      <NodeBadges notes={node.notes} link={node.links[0]} />
      {node.children.length > 0 && (
        <CollapseButton
          label={label}
          collapsed={node.collapsed}
          side={props.side}
          onToggle={() => actions.toggle(id)}
        />
      )}
      {props.resizable && (
        <ResizeHandle helpId={props.resizeHelpId} handleProps={actions.resizeHandle(id)} />
      )}
    </div>
  );
});
