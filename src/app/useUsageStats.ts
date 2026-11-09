import { useCallback, useState } from 'react';
import type { UsageStats } from '../adapters/analytics';
import { markUsageNoticeSeen, usageNoticeSeen } from '../adapters/storage/privacy';

/** The settings switch and the one-time notice for usage statistics; null when off-site. */
export function useUsageStats(stats: UsageStats | null | undefined) {
  const [enabled, setEnabled] = useState(stats?.enabled ?? false);
  const [noticeOpen, setNoticeOpen] = useState(() => Boolean(stats?.enabled) && !usageNoticeSeen());
  const closeNotice = useCallback(() => {
    markUsageNoticeSeen();
    setNoticeOpen(false);
  }, []);
  if (!stats) return null;
  const change = (next: boolean) => {
    stats.setEnabled(next);
    setEnabled(next);
    closeNotice();
  };
  return {
    setting: { enabled, change },
    notice: noticeOpen ? { onAccept: closeNotice, onDecline: () => change(false) } : null,
  };
}
