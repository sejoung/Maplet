import { useState } from 'react';
import { AlignCenter, AlignLeft, AlignRight, Check } from 'lucide-react';
import type { JsonObject } from '../domain/model';
import { FONT_SIZES, nodeTypography } from '../domain/typography';
import { useI18n } from '../i18n/react';
import { NodeStyleExtras } from './NodeStyleExtras';

const colors = [
  ['세이지', '#e9f1e8'],
  ['블루', '#e8eef8'],
  ['앰버', '#fbf0db'],
  ['로즈', '#f7e8e7'],
  ['라벤더', '#eee9f5'],
  ['화이트', '#ffffff'],
];
const alignments = [
  ['left', '왼쪽 정렬', AlignLeft],
  ['center', '가운데 정렬', AlignCenter],
  ['right', '오른쪽 정렬', AlignRight],
] as const;
const fonts = [
  ['sans', '기본 고딕'],
  ['serif', '명조'],
  ['mono', '고정폭'],
] as const;
const sizes = ['작게', '보통', '크게'];

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
          <label htmlFor="node-font">{t('글꼴')}</label>
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
          <label htmlFor="node-font-size">{t('글자 크기')}</label>
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
        <legend className="field-label">{t('텍스트 정렬')}</legend>
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
        <legend className="field-label">{t('배경색')}</legend>
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
          {t('기본 색상')}
        </button>
      </fieldset>
      <NodeStyleExtras style={style} onChange={setStyle} />
      <div className="dialog-actions">
        <button className="button" type="button" onClick={onClose}>
          {t('취소')}
        </button>
        <button className="button primary" type="submit">
          {t('서식 적용')}
        </button>
      </div>
    </form>
  );
}
