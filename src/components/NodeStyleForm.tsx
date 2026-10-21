import { useState } from 'react';
import { AlignCenter, AlignLeft, AlignRight, Check } from 'lucide-react';
import type { JsonObject } from '../domain/model';
import { FONT_SIZES, nodeTypography } from '../domain/typography';
import { useI18n } from '../i18n/react';
import { NodeStyleExtras } from './NodeStyleExtras';

const colors = [
  ['style.backgroundSage', '#e9f1e8'],
  ['style.backgroundBlue', '#e8eef8'],
  ['style.backgroundAmber', '#fbf0db'],
  ['style.backgroundRose', '#f7e8e7'],
  ['style.backgroundLavender', '#eee9f5'],
  ['style.backgroundWhite', '#ffffff'],
];
const alignments = [
  ['left', 'style.alignLeft', AlignLeft],
  ['center', 'style.alignCenter', AlignCenter],
  ['right', 'style.alignRight', AlignRight],
] as const;
const fonts = [
  ['sans', 'style.systemSans'],
  ['serif', 'style.serif'],
  ['mono', 'style.monospace'],
] as const;
const sizes = ['style.small', 'style.normal', 'style.large'];

export function NodeStyleForm({
  initialStyle,
  onApply,
  onClose,
}: {
  initialStyle: JsonObject;
  onApply(style: JsonObject): boolean;
  onClose(): void;
}) {
  const { t } = useI18n();
  const [style, setStyle] = useState(initialStyle);
  const typography = nodeTypography(style);
  return (
    <form
      className="node-style-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (onApply(style)) onClose();
      }}
    >
      <div className="typography-fields">
        <div>
          <label htmlFor="node-font">{t('common.font')}</label>
          <select
            id="node-font"
            data-autofocus
            value={typography.fontFamily}
            onChange={(event) => setStyle({ ...style, fontFamily: event.target.value })}
          >
            {fonts.map(([value, label]) => (
              <option key={value} value={value}>
                {t(label)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="node-font-size">{t('common.fontSize')}</label>
          <select
            id="node-font-size"
            value={typography.fontSize}
            onChange={(event) => setStyle({ ...style, fontSize: Number(event.target.value) })}
          >
            {FONT_SIZES.map((size, index) => (
              <option key={size} value={size}>
                {t(sizes[index])} ({size})
              </option>
            ))}
          </select>
        </div>
      </div>
      <fieldset className="alignment-field">
        <legend className="field-label">{t('common.textAlignment')}</legend>
        <div className="alignment-options">
          {alignments.map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              className="button"
              aria-label={t(label)}
              title={t(label)}
              aria-pressed={typography.textAlign === value}
              onClick={() => setStyle({ ...style, textAlign: value })}
            >
              <Icon size={18} aria-hidden="true" />
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="background-field">
        <legend className="field-label">{t('common.backgroundColor')}</legend>
        <div className="color-options">
          {colors.map(([name, color]) => (
            <button
              key={name}
              type="button"
              className="color-option"
              aria-label={t(name)}
              aria-pressed={style.background === color}
              onClick={() => setStyle({ ...style, background: color })}
            >
              <span className="color-chip" style={{ background: color }}>
                {style.background === color && <Check size={16} />}
              </span>
              <span>{t(name)}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="text-button"
          onClick={() => {
            const next = { ...style };
            delete next.background;
            setStyle(next);
          }}
        >
          {t('style.defaultColor')}
        </button>
      </fieldset>
      <NodeStyleExtras style={style} onChange={setStyle} />
      <div className="dialog-actions">
        <button className="button" type="button" onClick={onClose}>
          {t('common.cancel')}
        </button>
        <button className="button primary" type="submit">
          {t('style.applyStyle')}
        </button>
      </div>
    </form>
  );
}
