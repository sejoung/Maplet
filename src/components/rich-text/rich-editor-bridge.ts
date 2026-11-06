import { createContext, useContext } from 'react';
import type { FormatCommand, RangeFormat } from '../../domain/rich-text/rich-text';
import { createStore, type Store } from '../../domain/util/store';
import { useStore } from '../shared/useStore';

/** What the open title editor offers to the toolbar. */
export interface RichEditorHandle {
  apply(command: FormatCommand): void;
  /** Formatting of the text a command would act on, or null when there is none. */
  format(): RangeFormat | null;
}

/**
 * Lets the toolbar format the selected text of the inline title editor while it is open,
 * and re-render as that selection changes: every change publishes a fresh wrapper, since the
 * handle stays the same while what it reports moves on.
 */
export type RichEditorBridge = Store<{ handle: RichEditorHandle | null }>;

export const createRichEditorBridge = (): RichEditorBridge => createStore({ handle: null });

export const attachEditor = (bridge: RichEditorBridge, handle: RichEditorHandle | null) =>
  bridge.set({ handle });

/** The editor's selection or text changed. */
export const notifyEditor = (bridge: RichEditorBridge) =>
  bridge.set({ handle: bridge.get().handle });

export const RichEditorContext = createContext<RichEditorBridge | null>(null);

export const useRichEditorBridge = () => useContext(RichEditorContext);

const NO_EDITOR: RichEditorBridge = createRichEditorBridge();

/** The open editor, re-rendering when it opens, closes or its selection changes. */
export const useRichEditorState = (bridge: RichEditorBridge | null) =>
  useStore(bridge ?? NO_EDITOR).handle;
