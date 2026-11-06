import { useRef, useState } from 'react';
import { messageOf, type Message } from '../domain/errors';

/**
 * Serializes Drive operations. One exclusive operation runs at a time, and its results are
 * dropped once `cancel` supersedes it; `run` gets the generation it belongs to. `busy` also covers background
 * work such as loading Google's scripts, which does not hold the lock.
 */
export function useDriveOperation() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Message | null>(null);
  const generation = useRef(0);
  // Set synchronously, before `busy` renders, so a second click cannot start another one.
  const running = useRef(false);
  const idle = () => !busy && !running.current;
  const exclusive = async (
    run: (current: () => boolean, generation: number) => Promise<void>,
    failed: (reason: unknown) => void = () => {},
  ) => {
    if (!idle()) return;
    const operation = generation.current;
    const current = () => operation === generation.current;
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      await run(current, operation);
    } catch (reason) {
      if (current()) failed(reason);
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  /** Show `work` as busy without locking; a failure becomes the error under `fallback`. */
  const track = async (work: Promise<unknown> | undefined, fallback: string) => {
    setBusy(true);
    try {
      await work;
    } catch (reason) {
      setError(messageOf(reason, fallback));
    } finally {
      setBusy(false);
    }
  };
  return {
    busy,
    error,
    setError,
    idle,
    exclusive,
    track,
    /** Supersede the running operation; it finishes without reporting. */
    cancel: () => {
      generation.current++;
    },
  };
}
export type DriveOperation = ReturnType<typeof useDriveOperation>;
