import { afterEach } from 'vitest';

// Pure Node tests do not need React, DOM matchers or browser storage emulation.
if (typeof document !== 'undefined') {
  await import('@testing-library/jest-dom/vitest');
  const { cleanup } = await import('@testing-library/react');
  afterEach(cleanup);
}
