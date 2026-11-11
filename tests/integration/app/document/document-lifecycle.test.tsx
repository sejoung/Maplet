// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useDocument } from '../../../../src/app/document/useDocument';
import { useNodeCommands } from '../../../../src/app/document/useNodeCommands';
import { createMap, renameNode } from '../../../../src/domain/commands';
import { parseMup } from '../../../../src/adapters/mup/codec';
import { estimateTextWidth } from '../../../../src/engine/layout/node-measure';
import { translateMessage } from '../../../../src/i18n/core';
import { branchSpacingSource } from '../../../support/drag-fixture';

function setup() {
  const onEdited = vi.fn(),
    onError = vi.fn();
  const view = renderHook(() => {
    const doc = useDocument({
      title: 'Initial',
      filename: 'initial.maplet',
      onEdited,
      onError,
    });
    const commands = useNodeCommands(doc, {
      t: (key, params) => translateMessage(key, 'en', params),
      measure: estimateTextWidth,
    });
    return { doc, commands };
  });
  act(() => view.result.current.doc.replace(parseMup(branchSpacingSource()), 'spacing.mup'));
  return { ...view, onEdited, onError };
}

it('ignores a previous drag released after replacement but before React commits the new canvas', () => {
  const view = setup();
  const previous = view.result.current;
  act(() => {
    previous.doc.replace(createMap('Replacement'), 'replacement.maplet');
    // Both calls run before the next render, when Canvas still holds the old handlers.
    previous.commands.onReposition({ a: { x: 280, y: 240 }, child: { x: 480, y: 240 } });
  });
  expect(view.onError).not.toHaveBeenCalled();
  expect(view.onEdited).not.toHaveBeenCalled();
  expect(view.result.current.doc.map.nodes.root.title).toBe('Replacement');
  expect(view.result.current.doc.canUndo).toBe(false);
  expect(view.result.current.doc.dirty).toBe(false);
});

it('does not apply a stale drag even when the replacement reuses the same node ID', () => {
  const view = setup();
  const previous = view.result.current;
  act(() => {
    previous.doc.replace(createMap('Replacement'), 'replacement.maplet');
    previous.commands.onReposition({ root: { x: 700, y: 900 } });
  });
  expect(view.result.current.doc.map.nodes.root.position).toBeNull();
  expect(view.result.current.doc.canUndo).toBe(false);
  expect(view.result.current.doc.dirty).toBe(false);
  expect(view.onEdited).not.toHaveBeenCalled();
  expect(view.onError).not.toHaveBeenCalled();
});

it('accepts fresh drag commands and several same-document edits before the next render', () => {
  const view = setup();
  act(() => view.result.current.doc.replace(createMap('Replacement'), 'replacement.maplet'));
  const current = view.result.current;
  act(() => {
    current.commands.onReposition({ root: { x: 120, y: 240 } });
    current.doc.edit((map) => renameNode(map, 'root', 'Edited'));
  });
  expect(view.result.current.doc.map.nodes.root).toMatchObject({
    title: 'Edited',
    position: { x: 120, y: 240 },
  });
  expect(view.result.current.doc.canUndo).toBe(true);
  expect(view.onEdited).toHaveBeenCalledTimes(2);
  expect(view.onError).not.toHaveBeenCalled();
  act(() => view.result.current.doc.undo());
  expect(view.result.current.doc.map.nodes.root.title).toBe('Replacement');
  expect(view.result.current.doc.map.nodes.root.position).toEqual({ x: 120, y: 240 });
});

it('invalidates old commands across several replacements in one render batch', () => {
  const view = setup();
  const previous = view.result.current;
  act(() => {
    previous.doc.replace(createMap('First'), 'first.maplet');
    previous.doc.replace(createMap('Second'), 'second.maplet');
    expect(previous.commands.onReposition({ root: { x: 700, y: 900 } })).toBe(false);
  });
  expect(view.result.current.doc.documentKey).toBe(previous.doc.documentKey + 2);
  expect(view.result.current.doc.filename).toBe('second.maplet');
  expect(view.result.current.doc.map.nodes.root).toMatchObject({ title: 'Second', position: null });
  expect(view.result.current.doc.canUndo).toBe(false);
  expect(view.onError).not.toHaveBeenCalled();
});

it('still reports invalid edits from the current document', () => {
  const view = setup();
  act(() => view.result.current.commands.onReposition({ missing: { x: 0, y: 0 } }));
  expect(view.onError).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ key: 'edit.nodeNotFound' }),
  );
  expect(view.result.current.doc.canUndo).toBe(false);
});
