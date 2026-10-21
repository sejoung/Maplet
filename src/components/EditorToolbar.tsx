import { useI18n } from '../i18n/react';
import type { RefObject } from 'react';
import {
  CircleHelp,
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
import { ToolbarMenu } from './ToolbarMenu';
import type { CanvasControls } from './canvas-types';
import { NodeActionItems, type NodeActionGroups } from './node-actions';
import type { NodeTool } from './NodeToolsDialog';

export function EditorToolbar({
  map,
  selected,
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
  command,
  controls,
  zoom,
}: {
  map: MindMap;
  selected: string;
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
  command(action: () => void): () => void;
  controls: RefObject<CanvasControls | null>;
  zoom: number;
}) {
  const { t } = useI18n();
  const node = map.nodes[selected];
  return (
    <div role="region" aria-label={t('편집 도구 모음')}>
      <div className="editor-toolbar" role="toolbar" aria-label={t('편집 도구')}>
        <div className="toolbar-group">
          <button
            className="icon-button"
            aria-label={t('실행 취소')}
            title={t('실행 취소 (Ctrl/⌘ Z)')}
            disabled={!canUndo}
            onClick={onUndo}
          >
            <Undo2 size={17} />
          </button>
          <button
            className="icon-button"
            aria-label={t('다시 실행')}
            title={t('다시 실행 (Ctrl/⌘ Shift Z)')}
            disabled={!canRedo}
            onClick={onRedo}
          >
            <Redo2 size={17} />
          </button>
        </div>
        <span className="tool-divider" />
        <button
          className="tool-button add-node"
          aria-label={t('하위 노드 추가')}
          title={t('하위 노드 추가 (Tab)')}
          onClick={() => onAdd()}
        >
          <Plus size={17} />
          <span>{t('하위 노드')}</span>
        </button>
        <button
          className="tool-button delete-node"
          aria-label={t('선택한 노드 삭제')}
          title={t('선택한 노드 삭제 (Delete)')}
          disabled={node.parentId === null && map.roots.length === 1}
          onClick={onDelete}
        >
          <Trash2 size={17} />
          <span>{t('삭제')}</span>
        </button>
        <ToolbarMenu label={t('노드 작업')} icon={<SquarePen size={18} />} className="node-menu">
          <NodeActionItems
            groups={[actions.create, actions.clipboard, actions.arrange, actions.remove]}
            wrap={command}
          />
        </ToolbarMenu>
        <span className="tool-divider desktop-tool" />
        <button
          className="tool-button desktop-tool"
          aria-label={t('메모')}
          onClick={command(() => openTool('notes'))}
        >
          <MessageSquare size={16} />
          <span>{t('메모')}</span>
          {node.notes && <span className="tool-dot" />}
        </button>
        <button
          className="tool-button desktop-tool"
          aria-label={t('링크')}
          onClick={command(() => openTool('link'))}
        >
          <Link2 size={16} />
          <span>{t('링크')}</span>
        </button>
        <button
          className="tool-button desktop-tool"
          aria-label={t('서식')}
          onClick={command(() => openTool('style'))}
        >
          <Palette size={16} />
          <span>{t('서식')}</span>
        </button>
        <button
          className="tool-button desktop-tool"
          aria-label={t('찾기')}
          onClick={command(() => openTool('search'))}
        >
          <Search size={16} />
          <span>{t('찾기')}</span>
        </button>
        <ToolbarMenu
          label={t('더보기')}
          icon={<MoreHorizontal size={18} />}
          className="mobile-tools"
        >
          <button onClick={command(() => openTool('notes'))}>
            <MessageSquare size={16} />
            {t('메모')}
          </button>
          <button onClick={command(() => openTool('link'))}>
            <Link2 size={16} />
            {t('링크')}
          </button>
          <button onClick={command(() => openTool('style'))}>
            <Palette size={16} />
            {t('서식')}
          </button>
          <button onClick={command(() => openTool('search'))}>
            <Search size={16} />
            {t('찾기')}
          </button>
          <hr />
          <button onClick={command(onHelp)} aria-label={t('단축키 도움말')}>
            <CircleHelp size={16} />
            {t('단축키 도움말')}
          </button>
        </ToolbarMenu>
        <button
          className="tool-button auto-layout-button"
          aria-label={t('전체 맵 자동 배치')}
          title={t('가지 크기에 맞춰 전체 맵을 균형 있게 자동 배치')}
          onClick={onArrange}
        >
          <WandSparkles size={17} />
          <span>{t('자동 배치')}</span>
        </button>
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
          onClick={onHelp}
        >
          <CircleHelp size={17} />
        </button>
      </div>
    </div>
  );
}
