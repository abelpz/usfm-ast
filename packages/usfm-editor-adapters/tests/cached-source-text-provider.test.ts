/**
 * Tests for CachedSourceTextProvider.
 *
 * The provider reads raw USFM from SourceCacheStorage and parses it via
 * @usfm-tools/parser. There is no in-row USJ cache — parsed data lives
 * exclusively in ProcessedCacheStorage (Layer 2).
 */
import type { CachedSourceFile, SourceCacheStorage } from '@usfm-tools/types';
import { CachedSourceTextProvider } from '../src/source-cache/cached-source-text-provider';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStorageStub(file: CachedSourceFile | null): SourceCacheStorage {
  return {
    getCachedFile: jest.fn().mockResolvedValue(file),
    listCachedRepos: jest.fn(),
    getCachedRepo: jest.fn(),
    putCachedRepo: jest.fn(),
    deleteCachedRepo: jest.fn(),
    listCachedFiles: jest.fn(),
    getPin: jest.fn(),
    listPins: jest.fn(),
    listAllPins: jest.fn(),
    setPin: jest.fn(),
    removePin: jest.fn(),
    getReferencedSnapshots: jest.fn(),
    garbageCollect: jest.fn(),
  } as unknown as SourceCacheStorage;
}

function makeFile(overrides?: Partial<CachedSourceFile>): CachedSourceFile {
  return {
    repoId: 'en/en_ult',
    releaseTag: 'v80',
    path: '01-GEN.usfm',
    content: '\\id GEN\n\\c 1\n\\v 1 In the beginning',
    ...overrides,
  };
}

const SAMPLE_USJ = { type: 'USJ', version: '3.1', content: [] };

// ---------------------------------------------------------------------------
// Normal load — always parses raw content
// ---------------------------------------------------------------------------

describe('CachedSourceTextProvider — load', () => {
  beforeEach(() => {
    jest.mock('@usfm-tools/parser', () => ({
      USFMParser: jest.fn().mockImplementation(() => ({
        parse: jest.fn(),
        toJSON: jest.fn().mockReturnValue(SAMPLE_USJ),
      })),
    }));
  });

  afterEach(() => {
    jest.resetModules();
  });

  it('parses USFM from raw file content and returns USJ', async () => {
    const file = makeFile();
    const storage = makeStorageStub(file);

    const provider = new CachedSourceTextProvider({
      cache: storage,
      repoId: 'en/en_ult',
      releaseTag: 'v80',
      ingredientPath: '01-GEN.usfm',
      langCode: 'en',
      displayName: 'ULT – English',
    });

    const result = await provider.load();
    expect(result).toEqual(SAMPLE_USJ);
    expect(storage.getCachedFile).toHaveBeenCalledWith('en/en_ult', 'v80', '01-GEN.usfm');
  });
});

// ---------------------------------------------------------------------------
// Missing file
// ---------------------------------------------------------------------------

describe('CachedSourceTextProvider — missing file', () => {
  it('throws a descriptive error when the file is not in the cache', async () => {
    const storage = makeStorageStub(null);

    const provider = new CachedSourceTextProvider({
      cache: storage,
      repoId: 'en/en_ult',
      releaseTag: 'v80',
      ingredientPath: 'MISSING.usfm',
      langCode: 'en',
      displayName: 'ULT – English',
    });

    await expect(provider.load()).rejects.toThrow(/not found in cache/i);
  });
});

// ---------------------------------------------------------------------------
// Provider identity
// ---------------------------------------------------------------------------

describe('CachedSourceTextProvider — identity', () => {
  it('id is cached:{repoId}@{releaseTag}:{ingredientPath}', () => {
    const storage = makeStorageStub(null);
    const provider = new CachedSourceTextProvider({
      cache: storage,
      repoId: 'en/en_ult',
      releaseTag: 'v80',
      ingredientPath: '01-GEN.usfm',
      langCode: 'en',
      displayName: 'ULT – English',
    });
    expect(provider.id).toBe('cached:en/en_ult@v80:01-GEN.usfm');
  });

  it('displayName and langCode are passed through', () => {
    const storage = makeStorageStub(null);
    const provider = new CachedSourceTextProvider({
      cache: storage,
      repoId: 'en/en_ult',
      releaseTag: 'v80',
      ingredientPath: '01-GEN.usfm',
      langCode: 'en',
      displayName: 'ULT – English',
    });
    expect(provider.displayName).toBe('ULT – English');
    expect(provider.langCode).toBe('en');
  });
});
