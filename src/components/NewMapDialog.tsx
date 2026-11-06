import { useI18n } from '../i18n/react';
import { useState } from 'react';
import { Dialog, DialogActions } from './Dialog';

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
    <Dialog title={t('header.newMap')} onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onCreate(title.trim());
        }}
      >
        <label htmlFor="new-title">{t('common.centralTopic')}</label>
        <input
          id="new-title"
          data-autofocus
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={t('common.centralTopic')}
          required
          maxLength={10000}
        />
        <DialogActions onCancel={onClose} submitLabel={t('header.create')} />
      </form>
    </Dialog>
  );
}
