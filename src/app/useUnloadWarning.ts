import { useEffect } from 'react';

/** Ask before leaving the page while `active`, e.g. with changes saved nowhere yet. */
export function useUnloadWarning(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const warning = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warning);
    return () => window.removeEventListener('beforeunload', warning);
  }, [active]);
}
