import { Check } from 'lucide-react';
import type { JsonObject } from '../domain/model';
import { LINE_COLORS, LINE_STYLES } from '../domain/node-colors';
import { NODE_ICONS } from '../domain/node-markers';
import { useI18n } from '../i18n/react';

const colorNames = [
  'style.lineGreen',
  'style.lineBlue',
  'style.lineAmber',
  'style.lineRed',
  'style.linePurple',
  'style.lineGray',
];
// Spoken and tooltip names; emoji names vary across screen readers.
const iconNames: Record<(typeof NODE_ICONS)[number], string> = {
  '⭐': 'style.iconStar',
  '✅': 'style.iconCheck',
  '❗': 'style.iconExclamation',
  '❓': 'style.iconQuestion',
  '💡': 'style.iconIdea',
  '🔥': 'style.iconFire',
  '📌': 'style.iconPin',
  '⚠️': 'style.iconWarning',
  '🎯': 'style.iconTarget',
  '📅': 'style.iconCalendar',
};
const lineNames = { solid: 'style.solid', dashed: 'style.dashed', dotted: 'style.dotted' } as const;

/**
 * Markers, borders and branch lines; each control sets or clears one style key. Bold,
 * italic and highlights are text formatting in the toolbar, not node style.
 */
export function NodeStyleExtras({
  style,
  onChange,
}: {
  style: JsonObject;
  onChange(style: JsonObject): void;
}) {
  const { t } = useI18n();
  const set = (key: string, value: string | null) => {
    const next = { ...style };
    if (value === null) delete next[key];
    else next[key] = value;
    onChange(next);
  };
  const palette = (key: string, legend: string) => (
    <fieldset className="line-color-field">
      <legend className="field-label">{t(legend)}</legend>
      <div className="swatches">
        <button
          type="button"
          className="swatch none"
          aria-label={t('style.defaultLine')}
          title={t('style.defaultLine')}
          aria-pressed={!LINE_COLORS.includes(style[key] as string)}
          onClick={() => set(key, null)}
        />
        {LINE_COLORS.map((color, index) => (
          <button
            key={color}
            type="button"
            className="swatch"
            aria-label={t(colorNames[index])}
            title={t(colorNames[index])}
            aria-pressed={style[key] === color}
            style={{ background: color }}
            onClick={() => set(key, color)}
          >
            {style[key] === color && <Check size={14} />}
          </button>
        ))}
      </div>
    </fieldset>
  );
  return (
    <>
      <div className="style-row">
        <div>
          <label htmlFor="node-task">{t('style.taskTodo')}</label>
          <select
            id="node-task"
            value={style.task === 'todo' || style.task === 'done' ? style.task : ''}
            onChange={(event) => set('task', event.target.value || null)}
          >
            <option value="">{t('style.taskNone')}</option>
            <option value="todo">{t('style.taskTodo')}</option>
            <option value="done">{t('common.done')}</option>
          </select>
        </div>
      </div>
      <fieldset className="icon-field">
        <legend className="field-label">{t('style.icon')}</legend>
        <div className="swatches">
          <button
            type="button"
            className="swatch none"
            aria-label={t('style.noIcon')}
            title={t('style.noIcon')}
            aria-pressed={!(NODE_ICONS as readonly unknown[]).includes(style.icon)}
            onClick={() => set('icon', null)}
          />
          {NODE_ICONS.map((icon) => (
            <button
              key={icon}
              type="button"
              className="swatch icon"
              aria-label={t(iconNames[icon])}
              title={t(iconNames[icon])}
              aria-pressed={style.icon === icon}
              onClick={() => set('icon', icon)}
            >
              <span aria-hidden="true">{icon}</span>
            </button>
          ))}
        </div>
      </fieldset>
      {palette('borderColor', 'style.borderColor')}
      {palette('branchColor', 'style.branchLineColor')}
      <div>
        <label htmlFor="node-line-style">{t('style.branchLineStyle')}</label>
        <select
          id="node-line-style"
          value={
            (LINE_STYLES as readonly unknown[]).includes(style.lineStyle)
              ? (style.lineStyle as string)
              : 'solid'
          }
          onChange={(event) =>
            set('lineStyle', event.target.value === 'solid' ? null : event.target.value)
          }
        >
          {LINE_STYLES.map((line) => (
            <option key={line} value={line}>
              {t(lineNames[line])}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}
