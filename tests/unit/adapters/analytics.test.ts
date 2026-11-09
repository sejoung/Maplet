// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import {
  GTAG_SRC,
  MAX_EXCEPTIONS,
  clearAnalyticsCookies,
  createUsageStats,
  describeError,
} from '../../../src/adapters/analytics';
import { USAGE_STATS_KEY } from '../../../src/adapters/storage/privacy';

const ID = 'G-TEST123';
const SITE = new URL('https://maplet.example/app/#new=Secret%20plan');
const calls = () => (window.dataLayer ?? []).map((entry) => Array.from(entry as IArguments));
const exceptions = () => calls().filter(([, name]) => name === 'exception');
const gtagScripts = () =>
  [...document.head.querySelectorAll('script')].filter((s) => s.src.startsWith(GTAG_SRC));
const disabled = () => (window as unknown as Record<string, unknown>)[`ga-disable-${ID}`];
const fail = (message: string) => window.dispatchEvent(new ErrorEvent('error', { message }));

afterEach(() => {
  delete window.dataLayer;
  delete window.gtag;
  for (const script of gtagScripts()) script.remove();
  localStorage.clear();
  document.cookie = '_ga=; max-age=0; path=/';
});

it('loads gtag and sends a page view without the URL hash', () => {
  document.title = 'Maplet';
  const stats = createUsageStats(ID, SITE);
  expect(stats?.enabled).toBe(true);
  expect(disabled()).toBe(false);
  expect(gtagScripts().map((s) => s.src)).toEqual([`${GTAG_SRC}?id=${ID}`]);
  expect(calls().find(([command]) => command === 'config')).toEqual([
    'config',
    ID,
    {
      page_location: 'https://maplet.example/app/',
      page_title: 'Maplet',
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    },
  ]);
});

it.each([
  ['no measurement ID', '', SITE],
  ['a malformed ID', 'UA-123', SITE],
  ['a loopback host', ID, new URL('http://127.0.0.1:4173/')],
  ['localhost', ID, new URL('http://localhost:5173/')],
])('is unavailable with %s', (_, id, page) => {
  expect(createUsageStats(id, page)).toBeNull();
  expect(window.dataLayer).toBeUndefined();
  expect(gtagScripts()).toHaveLength(0);
});

it('reports uncaught errors and rejections as capped exceptions', () => {
  createUsageStats(ID, SITE);
  window.dispatchEvent(new ErrorEvent('error', { error: new TypeError('boom') }));
  const rejection = new Event('unhandledrejection') as PromiseRejectionEvent;
  Object.defineProperty(rejection, 'reason', { value: 'lost' });
  window.dispatchEvent(rejection);
  expect(exceptions()).toEqual([
    ['event', 'exception', { description: 'TypeError: boom', fatal: true }],
    ['event', 'exception', { description: 'lost', fatal: false }],
  ]);
  for (let i = 0; i < MAX_EXCEPTIONS + 5; i += 1) fail(`e${i}`);
  expect(exceptions()).toHaveLength(MAX_EXCEPTIONS);
});

it('loads nothing when the visitor turned statistics off earlier', () => {
  localStorage.setItem(USAGE_STATS_KEY, 'false');
  const stats = createUsageStats(ID, SITE);
  expect(stats?.enabled).toBe(false);
  expect(disabled()).toBe(true);
  expect(gtagScripts()).toHaveLength(0);
  expect(calls()).toEqual([]);
});

it('stops and resumes at once, remembering the choice', () => {
  const stats = createUsageStats(ID, SITE)!;
  document.cookie = '_ga=GA1.1.123; path=/';
  stats.setEnabled(false);
  expect(stats.enabled).toBe(false);
  expect(disabled()).toBe(true);
  expect(localStorage.getItem(USAGE_STATS_KEY)).toBe('false');
  expect(document.cookie).not.toContain('_ga=');
  fail('while off');
  expect(exceptions()).toHaveLength(0);

  stats.setEnabled(true);
  expect(disabled()).toBe(false);
  expect(localStorage.getItem(USAGE_STATS_KEY)).toBe('true');
  expect(gtagScripts()).toHaveLength(1);
  fail('back on');
  expect(exceptions()).toHaveLength(1);
});

it('clears only GA cookies', () => {
  document.cookie = '_ga=1; path=/';
  document.cookie = '_ga_ABC=2; path=/';
  document.cookie = 'other=3; path=/';
  clearAnalyticsCookies('maplet.example');
  expect(document.cookie).toBe('other=3');
  document.cookie = 'other=; max-age=0; path=/';
});

it('describes thrown values briefly', () => {
  expect(describeError(new Error('x'.repeat(200)))).toHaveLength(100);
  expect(describeError({ any: 'object' })).toBe('Unknown error');
});
