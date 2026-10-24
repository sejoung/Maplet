import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { GoogleConnection } from '../adapters/drive/google';
import { messageOf } from '../domain/errors';

/**
 * Google's token model issues no refresh token and its popup needs a user gesture, so an
 * expiring connection is renewed on the next click. Keyboard input is left alone because
 * the popup would take focus mid-typing. After a failed attempt only the header button
 * renews, so a closed or blocked popup is not reopened on every click.
 */
export function useAuthRenewal(
  google: GoogleConnection | null,
  active: boolean,
  setNotice: (message: string) => void,
) {
  const [expiring, setExpiring] = useState(() => Boolean(google?.expiring()));
  const [automatic, setAutomatic] = useState(true);
  const renewing = useRef(false);
  const renew = async (manual: boolean) => {
    if (!google || renewing.current || !google.expiring()) return;
    renewing.current = true;
    try {
      await google.connect();
    } catch (reason) {
      setAutomatic(false);
      if (manual) setNotice(messageOf(reason, 'drive.googleSignWindowClosedBlocked').key);
    } finally {
      renewing.current = false;
      setExpiring(google.expiring());
    }
  };
  const latest = useRef(renew);
  useLayoutEffect(() => {
    latest.current = renew;
  });
  useEffect(() => {
    if (!google) return;
    setExpiring(google.expiring());
    return google.subscribe((event) => {
      setExpiring(google.expiring());
      // A new token, an expiry or a disconnect starts over with automatic renewal allowed.
      if (event !== 'expiring') setAutomatic(true);
    });
  }, [google]);
  useEffect(() => {
    if (!expiring || !automatic || !active) return;
    const click = (event: MouseEvent) => {
      // The header button reports its own failure.
      if (event.target instanceof Element && event.target.closest('.drive-renew')) return;
      void latest.current(false);
    };
    window.addEventListener('click', click, true);
    return () => window.removeEventListener('click', click, true);
  }, [expiring, automatic, active]);
  return { expiring, renew: () => renew(true) };
}
