import { useLayoutEffect, useRef } from 'react';

/**
 * A ref that always holds the value of the last committed render, so stable callbacks and
 * long-lived subscriptions can call the current props without being recreated.
 */
export function useLatest<T>(value: T) {
  const latest = useRef(value);
  useLayoutEffect(() => {
    latest.current = value;
  });
  return latest;
}
