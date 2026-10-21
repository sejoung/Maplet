import { useI18n } from '../i18n/react';
import { Dialog } from './Dialog';

export function ShortcutHelpDialog({
  onClose,
  saveToDrive = false,
}: {
  onClose(): void;
  saveToDrive?: boolean;
}) {
  const { t } = useI18n();
  return (
    <Dialog title={t('shortcuts.keyboardShortcuts')} onClose={onClose}>
      <p className="muted">{t('shortcuts.selectNodeCanvasFirst')}</p>
      <dl className="shortcut-list">
        {[
          ['Tab', 'common.addChildNode'],
          ['Enter', 'common.addSiblingNode'],
          ['shortcuts.f2DoubleClick', 'common.editTitle'],
          ['shortcuts.arrowKeys', 'shortcuts.navigateBetweenNodes'],
          ['Delete / ⌫', 'shortcuts.deleteNodeDescendants'],
          ['⌘ / Ctrl + C · X · V', 'shortcuts.copyCutPasteBranch'],
          ['⌘ / Ctrl + D', 'shortcuts.duplicateBranch'],
          ['Alt + ↑ / ↓', 'shortcuts.reorderAmongSiblings'],
          ['shortcuts.rightClickShiftF10', 'shortcuts.openNodeMenu'],
          ['shortcuts.rightClickEmptyCanvas', 'shortcuts.openMapMenu'],
          ['⌘ / Ctrl + Z', 'common.undo'],
          ['⌘ / Ctrl + Shift + Z', 'common.redo'],
          ['⌘ / Ctrl + S', saveToDrive ? 'common.saveDrive' : 'shortcuts.downloadMapletFile'],
          ['shortcuts.spaceDrag', 'shortcuts.panCanvas'],
          ['shortcuts.ctrlWheelPinch', 'shortcuts.zoom'],
          ['⌘ / Ctrl + + / − / 0', 'shortcuts.zoomZoomOutFitScreen'],
          ['shortcuts.dragCorner', 'common.resizeNode'],
          ['shortcuts.doubleClickCornerHome', 'shortcuts.automaticSize'],
          ['shortcuts.dragNode', 'shortcuts.adjustPositionConnectionLength'],
          ['shortcuts.dropAnotherNode', 'shortcuts.moveUnderNode'],
          ['shortcuts.altDrag', 'shortcuts.movePositionOnlyEvenNear'],
          ['shortcuts.dropAboveBelow', 'shortcuts.insertBeforeAfter'],
          ['⌘ / Ctrl + F', 'shortcuts.findNodes'],
          ['shortcuts.shiftCmdCtrlClick', 'shortcuts.selectSeveralNodes'],
          ['shortcuts.shiftDragEmptyArea', 'shortcuts.selectArea'],
          ['shortcuts.shiftArrowKeys', 'shortcuts.extendSelection'],
          ['⌘ / Ctrl + A', 'shortcuts.selectAllVisibleNodes'],
          ['Esc', 'shortcuts.clearMultiNodeSelection'],
        ].map(([key, action]) => (
          <div key={key}>
            <dt>
              <kbd>{t(key)}</kbd>
            </dt>
            <dd>{t(action)}</dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}
