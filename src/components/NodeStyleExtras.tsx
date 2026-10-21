import { Bold, Check, Italic } from 'lucide-react';
import type { JsonObject } from '../domain/model';
import { LINE_COLORS, LINE_STYLES } from '../domain/node-colors';
import { NODE_ICONS } from '../domain/node-markers';
import { useI18n } from '../i18n/react';

const colorNames = ['초록', '파랑', '호박', '빨강', '보라', '회색'];
const lineNames = { solid: '실선', dashed: '파선', dotted: '점선' } as const;

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
          aria-label={t('기본')}
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
          <legend className="field-label">{t('글자 꾸미기')}</legend>
          <div className="alignment-options">
            <button
              type="button"
              className="button"
              aria-label={t('굵게')}
              title={t('굵게')}
              aria-pressed={style.fontWeight === 'bold'}
              onClick={() => set('fontWeight', style.fontWeight === 'bold' ? null : 'bold')}
            >
              <Bold size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="button"
              aria-label={t('기울임')}
              title={t('기울임')}
              aria-pressed={style.fontStyle === 'italic'}
              onClick={() => set('fontStyle', style.fontStyle === 'italic' ? null : 'italic')}
            >
              <Italic size={18} aria-hidden="true" />
            </button>
          </div>
        </fieldset>
        <div>
          <label htmlFor="node-task">{t('할 일')}</label>
          <select
            id="node-task"
            value={style.task === 'todo' || style.task === 'done' ? style.task : ''}
            onChange={(event) => set('task', event.target.value || null)}
          >
            <option value="">{t('없음')}</option>
            <option value="todo">{t('할 일')}</option>
            <option value="done">{t('완료')}</option>
          </select>
        </div>
      </div>
      <fieldset className="icon-field">
        <legend className="field-label">{t('아이콘')}</legend>
        <div className="swatches">
          <button
            type="button"
            className="swatch none"
            aria-label={t('아이콘 없음')}
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
      {palette('borderColor', '테두리 색')}
      {palette('branchColor', '가지 선 색')}
      <div>
        <label htmlFor="node-line-style">{t('가지 선 모양')}</label>
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
