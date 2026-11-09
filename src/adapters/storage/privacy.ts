import { readItem, writeItem } from './web-storage';

export const DRAFT_PRIVACY_KEY = 'maplet:keep-local-drafts';
/** On unless turned off; unreadable storage keeps the default. */
export const keepLocalDrafts = (): boolean => readItem('local', DRAFT_PRIVACY_KEY) !== 'false';
export const rememberLocalDrafts = (enabled: boolean): void =>
  writeItem('local', DRAFT_PRIVACY_KEY, String(enabled));

export const USAGE_STATS_KEY = 'maplet:usage-stats';
export const USAGE_NOTICE_KEY = 'maplet:usage-stats-notice';
/** On unless turned off; unreadable storage keeps the default. */
export const sendUsageStats = (): boolean => readItem('local', USAGE_STATS_KEY) !== 'false';
export const rememberUsageStats = (enabled: boolean): void =>
  writeItem('local', USAGE_STATS_KEY, String(enabled));
/** The one-time notice that statistics are sent; shown again only if storage forgets it. */
export const usageNoticeSeen = (): boolean => readItem('local', USAGE_NOTICE_KEY) === 'seen';
export const markUsageNoticeSeen = (): void => writeItem('local', USAGE_NOTICE_KEY, 'seen');
