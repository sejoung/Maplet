import { Bold, Check, Italic } from 'lucide-react';
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
const lineNames = { solid: 'style.solid', dashed: 'style.dashed', dotted: 'style.dotted' } as const;

/** Emphasis, markers, borders and branch lines; each control sets or clears one style key. */
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
          aria-pressed={!LINE_COLORS.includes(style[key] as string)}
          onClick={() => set(key, null)}
        />
        {LINE_COLORS.map((color, index) => (
          <button
            key={color}
            type="button"
            className="swatch"
            aria-label={t(colorNames[index])}
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
        <fieldset>
          <legend className="field-label">{t('style.emphasis')}</legend>
          <div className="alignment-options">
            <button
              type="button"
              className="button"
              aria-label={t('style.bold')}
              title={t('style.bold')}
              aria-pressed={style.fontWeight === 'bold'}
              onClick={() => set('fontWeight', style.fontWeight === 'bold' ? null : 'bold')}
            >
              <Bold size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="button"
              aria-label={t('style.italic')}
              title={t('style.italic')}
              aria-pressed={style.fontStyle === 'italic'}
              onClick={() => set('fontStyle', style.fontStyle === 'italic' ? null : 'italic')}
            >
              <Italic size={18} aria-hidden="true" />
            </button>
          </div>
        </fieldset>
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
            aria-pressed={!(NODE_ICONS as readonly unknown[]).includes(style.icon)}
            onClick={() => set('icon', null)}
          />
          {NODE_ICONS.map((icon) => (
            <button
              key={icon}
              type="button"
              className="swatch icon"
              aria-label={icon}
              aria-pressed={style.icon === icon}
              onClick={() => set('icon', icon)}
            >
              {icon}
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
