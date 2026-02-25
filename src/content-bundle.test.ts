/// <reference types="node" />
// Verify that the built content.js is valid as a classic (non-module) script.
// content.js is injected via chrome.scripting.executeScript, which runs code
// as a classic script — top-level import/export statements are syntax errors
// in that context and will silently break the content script at runtime.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const contentPath = resolve(__dirname, '../dist/content.js');

describe('content.js bundle', () => {
  it.skipIf(!existsSync(contentPath))(
    'is valid as a classic (non-module) script (run `npm run build` first)',
    () => {
      const content = readFileSync(contentPath, 'utf-8');
      // new Function() parses code as a classic script body — same as
      // executeScript. Top-level import/export will throw SyntaxError.
      expect(() => new Function(content)).not.toThrow();
    }
  );
});
