/**
 * Google Analytics 4: one page view per load plus uncaught errors as `exception` events.
 * Nothing loads without a measurement ID or on a loopback host, so development and E2E
 * runs never reach Google. Visitors can turn it off; the choice is kept in this browser.
 */
import { rememberUsageStats, sendUsageStats } from './storage/privacy';

export const GTAG_SRC = 'https://www.googletagmanager.com/gtag/js';
/** GA4 drops event parameter values longer than this. */
const MAX_VALUE_LENGTH = 100;
/** Errors reported per page load; a render loop must not flood the property. */
export const MAX_EXCEPTIONS = 10;
const MEASUREMENT_ID = /^G-[A-Z0-9]+$/;
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

type Gtag = (...args: unknown[]) => void;
type PageAddress = Pick<URL, 'origin' | 'pathname' | 'hostname'>;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
  }
}

/** The visitor's switch for usage statistics. */
export interface UsageStats {
  readonly enabled: boolean;
  /** Persist the choice and start or stop sending at once. */
  setEnabled(enabled: boolean): void;
}

/** A short, content-free label for a thrown value. */
export function describeError(error: unknown): string {
  const text =
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : typeof error === 'string'
        ? error
        : 'Unknown error';
  return text.slice(0, MAX_VALUE_LENGTH);
}

/** Expire GA's `_ga` / `_ga_<id>` cookies on this host and every parent domain. */
export function clearAnalyticsCookies(hostname: string): void {
  const names = document.cookie
    .split(';')
    .map((cookie) => cookie.split('=')[0].trim())
    .filter((name) => name === '_ga' || name.startsWith('_ga_'));
  const labels = hostname.split('.');
  const domains = labels.map((_, i) => labels.slice(i).join('.')).filter((d) => d.includes('.'));
  for (const name of names) {
    document.cookie = `${name}=; max-age=0; path=/`;
    for (const domain of domains) document.cookie = `${name}=; max-age=0; path=/; domain=${domain}`;
  }
}

/**
 * Usage statistics for this page, or null when they cannot run here. Starts sending at once
 * unless the visitor turned them off earlier.
 */
export function createUsageStats(
  measurementId: string,
  page: PageAddress = window.location,
): UsageStats | null {
  if (!MEASUREMENT_ID.test(measurementId) || LOOPBACK.has(page.hostname)) return null;

  const dataLayer = (window.dataLayer ??= []);
  // gtag.js reads each queued `arguments` object, not an array copy.
  const gtag: Gtag = function () {
    // eslint-disable-next-line prefer-rest-params
    dataLayer.push(arguments);
  };
  let enabled = false;
  let installed = false;
  let reported = 0;

  const report = (error: unknown, fatal: boolean) => {
    if (!enabled || reported >= MAX_EXCEPTIONS) return;
    reported += 1;
    gtag('event', 'exception', { description: describeError(error), fatal });
  };
  const install = () => {
    installed = true;
    window.gtag = gtag;
    gtag('js', new Date());
    gtag('config', measurementId, {
      // The `#new=<title>` hash carries a map title; only the path is reported.
      page_location: page.origin + page.pathname,
      page_title: document.title,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    });
    window.addEventListener('error', (event) => report(event.error ?? event.message, true));
    window.addEventListener('unhandledrejection', (event) => report(event.reason, false));
    const script = document.createElement('script');
    script.async = true;
    script.src = `${GTAG_SRC}?id=${encodeURIComponent(measurementId)}`;
    document.head.append(script);
  };
  const apply = (next: boolean) => {
    enabled = next;
    // gtag.js's documented opt-out switch; it stops every hit for this property.
    Object.assign(window, { [`ga-disable-${measurementId}`]: !next });
    if (next && !installed) install();
    if (!next) clearAnalyticsCookies(page.hostname);
  };

  apply(sendUsageStats());
  return {
    get enabled() {
      return enabled;
    },
    setEnabled(next) {
      rememberUsageStats(next);
      apply(next);
    },
  };
}
