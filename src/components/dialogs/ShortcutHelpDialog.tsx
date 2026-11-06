import { useI18n } from '../../i18n/react';
import { manualPath } from '../../i18n/locale';
import { Dialog } from './Dialog';
import { helpLabel, SHORTCUTS as S, type Shortcut } from '../menus/shortcuts';

/** A row for key combinations, worded by their registry entry unless `description` is given. */
const keys = (shortcuts: Shortcut[], description = shortcuts[0].description, separator?: string) =>
  [helpLabel(shortcuts, separator), description] as const;

/** Key combinations come from the registry; gestures are catalog keys, translated as shown. */
const helpRows = (saveToDrive: boolean): (readonly [keys: string, description: string])[] => [
  keys([S.addChild]),
  keys([S.addSibling]),
  ['shortcuts.f2DoubleClick', 'common.editTitle'],
  keys([S.bold]),
  keys([S.italic]),
  keys([S.highlight]),
  keys([S.clearFormat]),
  ['shortcuts.rightClickSelection', 'shortcuts.formatMenu'],
  ['shortcuts.arrowKeys', 'shortcuts.navigateBetweenNodes'],
  keys([S.deleteNode]),
  keys([S.copy, S.cut, S.paste], 'shortcuts.copyCutPasteBranch', ' · '),
  keys([S.duplicate]),
  keys([S.moveUp, S.moveDown], 'shortcuts.reorderAmongSiblings'),
  ['shortcuts.rightClickShiftF10', 'shortcuts.openNodeMenu'],
  ['shortcuts.rightClickEmptyCanvas', 'shortcuts.openMapMenu'],
  keys([S.undo]),
  keys([S.redo]),
  keys([S.save], saveToDrive ? 'common.saveDrive' : S.save.description),
  ['shortcuts.spaceDrag', 'shortcuts.panCanvas'],
  ['shortcuts.ctrlWheelPinch', 'shortcuts.zoom'],
  keys([S.zoomIn, S.zoomOut, S.fit], 'shortcuts.zoomZoomOutFitScreen'),
  ['shortcuts.dragCorner', 'common.resizeNode'],
  ['shortcuts.doubleClickCornerHome', 'shortcuts.automaticSize'],
  ['shortcuts.dragNode', 'shortcuts.adjustPositionConnectionLength'],
  ['shortcuts.dropAnotherNode', 'shortcuts.moveUnderNode'],
  ['shortcuts.altDrag', 'shortcuts.movePositionOnlyEvenNear'],
  ['shortcuts.dropAboveBelow', 'shortcuts.insertBeforeAfter'],
  keys([S.find]),
  ['shortcuts.shiftCmdCtrlClick', 'shortcuts.selectSeveralNodes'],
  ['shortcuts.shiftDragEmptyArea', 'shortcuts.selectArea'],
  ['shortcuts.shiftArrowKeys', 'shortcuts.extendSelection'],
  keys([S.selectAll]),
  keys([S.clearSelection]),
];

export function ShortcutHelpDialog({
  onClose,
  saveToDrive = false,
}: {
  onClose(): void;
  saveToDrive?: boolean;
}) {
  const { t, language } = useI18n();
  return (
    <Dialog title={t('shortcuts.keyboardShortcuts')} onClose={onClose}>
      <p className="muted">{t('shortcuts.selectNodeCanvasFirst')}</p>
      <p>
        <a href={manualPath(language)} target="_blank" rel="noopener noreferrer">
          {t('shortcuts.openManual')}
        </a>
      </p>
      <dl className="shortcut-list">
        {helpRows(saveToDrive).map(([combo, action]) => (
          <div key={combo}>
            <dt>
              <kbd>{t(combo)}</kbd>
            </dt>
            <dd>{t(action)}</dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}
