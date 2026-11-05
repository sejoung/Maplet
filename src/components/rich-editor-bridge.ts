import { createContext, useContext, useSyncExternalStore } from 'react';
import type { FormatCommand, RangeFormat } from '../domain/rich-text';

/** What the open title editor offers to the toolbar. */
export interface RichEditorHandle {
  apply(command: FormatCommand): void;
  /** Formatting of the text a command would act on, or null when there is none. */
  format(): RangeFormat | null;
}

/**
 * Lets the toolbar format the selected text of the inline title editor while it is open,
 * and re-render as that selection changes.
 */
export class RichEditorBridge {
  current: RichEditorHandle | null = null;
  private version = 0;
  private listeners = new Set<() => void>();

  attach(handle: RichEditorHandle | null) {
    this.current = handle;
    this.notify();
  }

  notify() {
    this.version++;
    this.listeners.forEach((listener) => listener());
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  snapshot = () => this.version;
}

export const RichEditorContext = createContext<RichEditorBridge | null>(null);

export const useRichEditorBridge = () => useContext(RichEditorContext);

/** Re-render when the editor opens, closes or its selection changes. */
export function useRichEditorState(bridge: RichEditorBridge | null) {
  useSyncExternalStore(
    bridge?.subscribe ?? (() => () => {}),
    bridge?.snapshot ?? (() => 0),
    bridge?.snapshot ?? (() => 0),
  );
  return bridge?.current ?? null;
}
