import { AppError } from '../../domain/errors';

const LOAD_TIMEOUT_MS = 15_000;
// One download per script; a failed or stalled one is forgotten so the next call retries.
const scripts = new Map<string, Promise<void>>();

export function loadScript(src: string): Promise<void> {
  if (!scripts.has(src))
    scripts.set(
      src,
      new Promise((resolve, reject) => {
        const element = document.createElement('script');
        element.src = src;
        element.async = true;
        const fail = (key: string) => {
          clearTimeout(timer);
          scripts.delete(src);
          element.remove();
          reject(new AppError(key));
        };
        const timer = window.setTimeout(
          () => fail('drive.googleConnectionTimedOut'),
          LOAD_TIMEOUT_MS,
        );
        element.onload = () => {
          clearTimeout(timer);
          resolve();
        };
        element.onerror = () => fail('drive.couldNotLoadGoogleServices');
        document.head.append(element);
      }),
    );
  return scripts.get(src)!;
}

/** Load `src` again even if it loaded before, e.g. after its global was removed. */
export function reloadScript(src: string): Promise<void> {
  scripts.delete(src);
  return loadScript(src);
}
