import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';

import { findPtxprint } from '../src/runner/findPtxprint';

describe('findPtxprint', () => {
  it('returns explicit path when file exists', () => {
    const dir = join(__dirname, 'fixture-bin');
    mkdirSync(dir, { recursive: true });
    const fake = join(dir, 'ptxprint-fake');
    writeFileSync(fake, '#!/bin/sh\n');
    try {
      expect(findPtxprint({ explicitPath: fake })).toBe(fake);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
