// @vitest-environment jsdom
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { useUsageStats } from '../../../src/app/useUsageStats';
import { USAGE_NOTICE_KEY } from '../../../src/adapters/storage/privacy';
import type { UsageStats } from '../../../src/adapters/analytics';
import { UsageNotice } from '../../../src/components/dialogs/UsageNotice';
import { SettingsDialog } from '../../../src/components/dialogs/SettingsDialog';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const fakeStats = (enabled = true): UsageStats => {
  const stats = {
    enabled,
    setEnabled: vi.fn((next: boolean) => {
      stats.enabled = next;
    }),
  };
  return stats;
};

it('offers nothing where statistics cannot run', () => {
  const { result } = renderHook(() => useUsageStats(null));
  expect(result.current).toBeNull();
});

it('shows the notice once and remembers that it was seen', () => {
  const stats = fakeStats();
  const first = renderHook(() => useUsageStats(stats));
  expect(first.result.current?.notice).not.toBeNull();
  act(() => first.result.current!.notice!.onAccept());
  expect(first.result.current?.notice).toBeNull();
  expect(stats.setEnabled).not.toHaveBeenCalled();
  expect(localStorage.getItem(USAGE_NOTICE_KEY)).toBe('seen');

  const later = renderHook(() => useUsageStats(stats));
  expect(later.result.current?.notice).toBeNull();
});

it('turns statistics off from the notice', () => {
  const stats = fakeStats();
  const { result } = renderHook(() => useUsageStats(stats));
  act(() => result.current!.notice!.onDecline());
  expect(stats.setEnabled).toHaveBeenCalledWith(false);
  expect(result.current?.setting.enabled).toBe(false);
  expect(result.current?.notice).toBeNull();
  expect(localStorage.getItem(USAGE_NOTICE_KEY)).toBe('seen');
});

it('skips the notice when statistics are already off', () => {
  const { result } = renderHook(() => useUsageStats(fakeStats(false)));
  expect(result.current?.setting.enabled).toBe(false);
  expect(result.current?.notice).toBeNull();
});

it('turns statistics off from the setting and closes the notice', () => {
  const stats = fakeStats();
  const { result } = renderHook(() => useUsageStats(stats));
  act(() => result.current!.setting.change(false));
  expect(stats.setEnabled).toHaveBeenCalledWith(false);
  expect(result.current?.setting.enabled).toBe(false);
  expect(result.current?.notice).toBeNull();
});

it('renders the settings switch only when statistics are available', async () => {
  const change = vi.fn();
  const view = render(<SettingsDialog onClose={() => {}} />);
  expect(screen.queryByRole('checkbox', { name: '사용 통계 보내기' })).toBeNull();
  view.rerender(<SettingsDialog onClose={() => {}} usageStats={{ enabled: true, change }} />);
  await userEvent.click(screen.getByRole('checkbox', { name: '사용 통계 보내기' }));
  expect(change).toHaveBeenCalledWith(false);
});

it('names the card and offers turning off or keeping statistics', async () => {
  const onAccept = vi.fn();
  const onDecline = vi.fn();
  render(<UsageNotice onAccept={onAccept} onDecline={onDecline} />);
  const card = screen.getByRole('region', { name: '사용 통계' });
  expect(card).toHaveTextContent('Google Analytics');
  await userEvent.click(screen.getByRole('button', { name: '끄기' }));
  expect(onDecline).toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: '확인' }));
  expect(onAccept).toHaveBeenCalled();
});
