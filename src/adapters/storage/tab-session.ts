/** This tab's identity: its draft and Drive target stay separate from other open tabs. */
export interface TabSession {
  id: string;
  /** The same tab after a reload or session restore, so it may resume its own work. */
  reopened: boolean;
  /** Title requested by "New map" in another tab; such a tab never offers recovery. */
  newMap: string | null;
  /** Other tabs open at startup; their drafts and Drive targets are not taken over. */
  live: ReadonlySet<string>;
}

/** A first visit with no other tabs; used when nothing identifies the tab. */
export const FRESH_TAB: TabSession = {
  id: 'current',
  reopened: false,
  newMap: null,
  live: new Set(),
};

const ID_KEY = 'maplet:tab';
const LOCK_PREFIX = 'maplet:tab:';
const NEW_MAP = /^#new=(.*)$/s;
// A reload can briefly overlap the closing page that still holds the lock.
const RELOAD_WAIT = 1000;

export const draftKey = (id: string) => `tab:${id}`;
export const draftOwner = (key: string) => (key.startsWith('tab:') ? key.slice(4) : null);

function readId(): string | null {
  try {
    return sessionStorage.getItem(ID_KEY);
  } catch {
    return null;
  }
}
function writeId(id: string): void {
  try {
    sessionStorage.setItem(ID_KEY, id);
  } catch {
    // The tab still works; a reload just starts as a new tab.
  }
}

/** Hold the tab's lock until the page closes; false if another tab already holds it. */
function hold(locks: LockManager, id: string, wait: number): Promise<boolean> {
  return new Promise((resolve) => {
    const options: LockOptions = wait
      ? { signal: AbortSignal.timeout(wait) }
      : { ifAvailable: true };
    locks
      .request(LOCK_PREFIX + id, options, (lock) => {
        resolve(Boolean(lock));
        return lock ? new Promise<void>(() => {}) : undefined;
      })
      .catch(() => resolve(false));
  });
}

function takeNewMapRequest(): string | null {
  const match = NEW_MAP.exec(window.location.hash);
  if (!match) return null;
  // A reload of this tab must recover its draft instead of creating the map again.
  history.replaceState(history.state, '', window.location.pathname + window.location.search);
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export async function startTab(
  locks: LockManager | undefined = navigator.locks,
): Promise<TabSession> {
  const newMap = takeNewMapRequest();
  const previous = newMap === null ? readId() : null;
  let id = previous;
  let reopened = false;
  if (previous) reopened = locks ? await hold(locks, previous, RELOAD_WAIT) : true;
  if (!reopened) {
    // A duplicated tab copies sessionStorage; the original keeps its ID.
    id = crypto.randomUUID();
    writeId(id);
    if (locks) await hold(locks, id, 0);
  }
  const live = new Set<string>();
  if (locks) {
    try {
      for (const lock of (await locks.query()).held ?? [])
        if (lock.name?.startsWith(LOCK_PREFIX) && lock.name !== LOCK_PREFIX + id)
          live.add(lock.name.slice(LOCK_PREFIX.length));
    } catch {
      // Without the list every other draft counts as closed, as before tabs were separated.
    }
  }
  return { id: id!, reopened, newMap, live };
}

/** Open a new tab that starts a map with this title. The hash never reaches the server. */
export function openNewMapTab(title: string): void {
  const url = `${window.location.pathname}${window.location.search}#new=${encodeURIComponent(title)}`;
  // noopener keeps this tab's sessionStorage, and so its identity, out of the new tab.
  window.open(url, '_blank', 'noopener');
}
