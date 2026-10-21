import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './styles.css';
import { getLanguage, initializeLanguage } from './i18n/locale';
import { translate } from './i18n/core';
import { clearDriveSession } from './adapters/drive/session';
import { applyTheme, readTheme } from './components/theme';

initializeLanguage();
applyTheme(readTheme());
// Migration: older releases stored Drive credentials; none are ever restored.
clearDriveSession();

const root = document.getElementById('root')!;
// Static hosting cannot send `frame-ancestors`; refuse to run inside another site's frame
// so the editor cannot be overlaid for clickjacking.
if (window.top !== window.self)
  root.textContent = translate('Maplet은 다른 사이트 안에서 열 수 없습니다.', getLanguage());
else
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
