import { expect, it } from 'vitest';
import { restoreDraft } from '../../src/adapters/storage/recovery';
import { serializeMaplet } from '../../src/adapters/maplet/codec';
import { driveSaveTarget } from '../../src/adapters/documents';

it('migrates legacy MUP drafts and their saved baseline without losing the original backup', () => {
  const content = '{"id":1,"title":"Edited","attr":{"maplet:position":{"x":12,"y":34}}}';
  const original = '{"id":1,"title":"Original"}';
  const recovered = restoreDraft({
    content,
    original,
    filename: 'old.mup',
    savedContent: original,
    updatedAt: 1,
  });
  expect(recovered.filename).toBe('old.maplet');
  expect(recovered.map.original).toBe(original);
  expect(recovered.map.nodes['1'].position).toEqual({ x: 12, y: 34 });
  expect(JSON.parse(recovered.savedContent).format).toBe('maplet');
  expect(serializeMaplet(recovered.map)).not.toBe(recovered.savedContent);
  const clean = restoreDraft({
    content: original,
    original,
    filename: 'old.mup',
    savedContent: original,
    updatedAt: 1,
  });
  expect(serializeMaplet(clean.map)).toBe(clean.savedContent);
  expect(
    restoreDraft({ content, original, filename: 'new.mup', savedContent: '', updatedAt: 1 })
      .savedContent,
  ).toBe('');
});

it('creates a new native Drive file when the imported file is MUP and updates native files', () => {
  expect(driveSaveTarget('old.maplet', { name: 'old.mup' }, false)).toEqual({
    create: true,
    name: 'old.maplet',
  });
  expect(driveSaveTarget('old.maplet', { name: 'old.maplet' }, false)).toEqual({
    create: false,
    name: 'old.maplet',
  });
  expect(driveSaveTarget('old.maplet', { name: 'old.maplet' }, true)).toEqual({
    create: true,
    name: 'old (copy).maplet',
  });
  expect(driveSaveTarget('new', null, false)).toEqual({ create: true, name: 'new.maplet' });
});

it('keeps a clean legacy baseline clean when its untouched original uses different whitespace', () => {
  const content = '{"id":1,"title":"Original"}';
  const original = '{\n  "id": 1,\n  "title": "Original"\n}\n';
  const recovered = restoreDraft({
    content,
    original,
    filename: 'old.mup',
    savedContent: content,
    updatedAt: 1,
  });
  expect(serializeMaplet(recovered.map)).toBe(recovered.savedContent);
});
