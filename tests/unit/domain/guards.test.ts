import { expect, it } from 'vitest';
import { isNonEmptyString, isOneOf } from '../../../src/domain/util/guards';
import { isValidRank } from '../../../src/domain/ranks';

it('accepts only present, non-empty strings', () => {
  expect(isNonEmptyString('id')).toBe(true);
  for (const value of ['', null, undefined, 1, {}, ['id']])
    expect(isNonEmptyString(value)).toBe(false);
});

it('narrows to one of a fixed set', () => {
  expect(isOneOf(['left', 'right'], 'left')).toBe(true);
  expect(isOneOf(['left', 'right'], 'up')).toBe(false);
});

it('accepts stored ranks that are nonzero finite numbers', () => {
  for (const rank of ['1', '-2', '0.5', ' 3 ']) expect(isValidRank(rank), rank).toBe(true);
  for (const rank of ['0', '-0', '', ' ', 'x', 'Infinity', '1e999', 1, null])
    expect(isValidRank(rank), String(rank)).toBe(false);
});
