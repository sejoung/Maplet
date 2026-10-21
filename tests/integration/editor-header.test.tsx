// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { EditorHeader } from '../../src/components/EditorHeader';

afterEach(cleanup);

function header(overrides: Partial<Parameters<typeof EditorHeader>[0]> = {}) {
  const props = {
    filename: 'map.maplet',
    documentKey: 0,
    onFilenameChange: vi.fn(),
    dirty: false,
    original: null,
    driveConfigured: true,
    driveConnected: false,
    driveBusy: false,
    driveSync: null,
    saveToDrive: false,
    canSaveCopy: false,
    editingText: false,
    onNew: vi.fn(),
    onOpen: vi.fn(),
    onOpenDrive: vi.fn(),
    onSave: vi.fn(),
    onSaveCopy: vi.fn(),
    onDownload: vi.fn(),
    onExportMup: vi.fn(),
    onBackup: vi.fn(),
    onExportImage: vi.fn(),
    onDrive: vi.fn(),
    onSettings: vi.fn(),
    command: (action: () => void) => action,
    ...overrides,
  };
  render(<EditorHeader {...props} />);
  return props;
}
const banner = () => within(screen.getByRole('banner'));
const actions = () => screen.getByRole('banner').querySelector('.header-actions') as HTMLElement;

it('offers a quiet download when working locally and highlights it only with unsaved changes', () => {
  header();
  const download = within(actions()).getByRole('button', { name: '.maplet 다운로드' });
  expect(download).not.toHaveClass('primary');
  cleanup();
  const props = header({ dirty: true });
  const dirty = within(actions()).getByRole('button', { name: '.maplet 다운로드' });
  expect(dirty).toHaveClass('primary');
  fireEvent.click(dirty);
  expect(props.onSave).toHaveBeenCalledOnce();
  expect(banner().queryByRole('button', { name: '지금 저장' })).not.toBeInTheDocument();
});

it('replaces the save button with the sync state while Drive autosaves', () => {
  const props = header({
    saveToDrive: true,
    driveConnected: true,
    canSaveCopy: true,
    driveSync: { kind: 'synced', label: '동기화 완료' },
  });
  expect(within(actions()).queryByRole('button', { name: '.maplet 다운로드' })).toBeNull();
  expect(screen.getByRole('status', { name: 'Drive 동기화 상태' })).toHaveTextContent(
    '동기화 완료',
  );
  expect(screen.getByRole('button', { name: 'Google Drive 연결됨' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Drive 저장 다시 시도' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '지금 저장' }));
  fireEvent.click(screen.getByRole('button', { name: '다른 위치에 사본 저장' }));
  expect(props.onSave).toHaveBeenCalledOnce();
  expect(props.onSaveCopy).toHaveBeenCalledOnce();
});

it('asks for attention and offers a retry only when saving failed', () => {
  const props = header({
    saveToDrive: true,
    driveConnected: true,
    driveSync: { kind: 'error', label: '동기화 오류' },
  });
  expect(screen.getByRole('banner').querySelector('.drive-control')).toHaveClass('needs-attention');
  fireEvent.click(screen.getByRole('button', { name: 'Drive 저장 다시 시도' }));
  expect(props.onSave).toHaveBeenCalledOnce();
});

it('hides Drive controls in deployments without Google configuration', () => {
  header({ driveConfigured: false });
  expect(screen.queryByRole('button', { name: /Google Drive/ })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Drive에서 열기' })).toBeNull();
  expect(within(actions()).getByRole('button', { name: '.maplet 다운로드' })).toBeInTheDocument();
});
