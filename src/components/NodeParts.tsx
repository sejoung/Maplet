import type { ButtonHTMLAttributes } from 'react';
import { Check, ExternalLink, Minus, Plus, StickyNote } from 'lucide-react';
import { safeUrl } from '../domain/commands';
import type { Side } from '../domain/model';
import type { markerMetrics } from '../engine/render-metrics';
import { useI18n } from '../i18n/react';
import { notesPreview } from './node-presentation';

/** The task checkbox and icon before a title. */
export function NodeMarkers({
  markers,
  fontSize,
  label,
  onToggleTask,
}: {
  markers: ReturnType<typeof markerMetrics>;
  fontSize: number;
  label: string;
  onToggleTask(): void;
}) {
  const { t } = useI18n();
  if (!markers.task && !markers.icon) return null;
  return (
    <span className="node-markers" style={{ width: markers.width }}>
      {markers.task && (
        <button
          type="button"
          className="node-task"
          role="checkbox"
          aria-checked={markers.task === 'done'}
          aria-label={t('canvas.taskDone', { title: label })}
          tabIndex={-1}
          onClick={(event) => {
            event.stopPropagation();
            onToggleTask();
          }}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          {markers.task === 'done' && <Check size={12} strokeWidth={3} />}
        </button>
      )}
      {markers.icon && (
        <span
          className="node-icon"
          aria-hidden="true"
          style={{ width: markers.iconSize, fontSize }}
        >
          {markers.icon}
        </span>
      )}
    </span>
  );
}

/** Notes and link indicators after a title. */
export function NodeBadges({ notes, link }: { notes: string; link: string | undefined }) {
  const { t } = useI18n();
  if (!notes && !link) return null;
  return (
    <span className="node-badges">
      {notes && (
        <span
          className="node-badge"
          role="img"
          aria-label={t('canvas.hasNotes')}
          title={notesPreview(notes)}
        >
          <StickyNote size={11} aria-hidden="true" />
        </span>
      )}
      {link && safeUrl(link) && (
        <a
          className="node-badge"
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          tabIndex={-1}
          aria-label={`${t('canvas.openLink')}: ${link}`}
          title={link}
          onClick={(event) => event.stopPropagation()}
        >
          <ExternalLink size={11} aria-hidden="true" />
        </a>
      )}
    </span>
  );
}

export function CollapseButton({
  label,
  collapsed,
  side,
  onToggle,
}: {
  label: string;
  collapsed: boolean;
  side: Side;
  onToggle(): void;
}) {
  const { t } = useI18n();
  return (
    <button
      className={`collapse-node ${side}`}
      aria-label={`${label} ${collapsed ? t('common.expand') : t('common.collapse')}`}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
    >
      {collapsed ? <Plus size={12} /> : <Minus size={12} />}
    </button>
  );
}

/** Drag to set the node's width; the canvas runs the drag, the handle owns its keys. */
export function ResizeHandle({
  helpId,
  handleProps,
}: {
  helpId: string;
  handleProps: ButtonHTMLAttributes<HTMLButtonElement>;
}) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      className="resize-node"
      data-resize-handle
      aria-label={t('common.resizeNode')}
      aria-describedby={helpId}
      title={t('canvas.resizeHint')}
      {...handleProps}
    />
  );
}
