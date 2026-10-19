import { useI18n } from '../i18n/react';
import { useState } from 'react';
import { Dialog } from './Dialog';

export function NewMapDialog({
  onClose,
  onCreate,
}: {
  onClose(): void;
  onCreate(title: string): void;
}) {
  const { t } = useI18n();
  const [title, setTitle] = useState('');
  return (
    <Dialog title={t('새 맵')} onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onCreate(title.trim());
        }}
      >
        <label htmlFor="new-title">{t('중심 주제')}</label>
        <input
          id="new-title"
          data-autofocus
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={t('중심 주제')}
          required
          maxLength={10000}
        />
        <div className="dialog-actions">
          <button className="button quiet" type="button" onClick={onClose}>
            {t('취소')}
          </button>
          <button className="button primary" type="submit">
            {t('만들기')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
