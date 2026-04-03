/**
 * Workspace packages ship CommonJS `dist` builds. Vite's native ESM graph cannot
 * satisfy `import { USFMParser } from '...'` against raw CJS (no static named exports).
 * Namespace imports + `optimizeDeps.include` let the pre-bundle (or runtime interop) work.
 */
import * as Parser from '@usfm-tools/parser';
import * as Adapters from '@usfm-tools/adapters';

export const USFMParser = Parser.USFMParser;
export const USFMVisitor = Adapters.USFMVisitor;
export const USXVisitor = Adapters.USXVisitor;
export const convertUSJDocumentToUSFM = Adapters.convertUSJDocumentToUSFM;
