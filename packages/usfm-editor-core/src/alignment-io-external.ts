/**
 * Read/write external alignment files under `alignments/{sourceDir}/{BOOK}.alignment.json`
 * using the canonical {@link AlignmentDocument} format from `alignment-io.ts`.
 */

import type { AlignmentManifestJson } from './project-format';
import { parseAlignmentJson, serializeAlignmentJson } from './alignment-io';
import type { AlignmentDocument } from '@usfm-tools/types';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

export const ALIGNMENTS_MANIFEST_PATH = 'alignments/manifest.json';

export function alignmentBookFilePath(sourceDirectory: string, bookCode: string): string {
  const book = bookCode.replace(/\.usfm$/i, '').toUpperCase();
  const dir = sourceDirectory.replace(/^\/+|\/+$/g, '');
  return `alignments/${dir}/${book}.alignment.json`;
}

/** Parse `alignments/manifest.json`. */
export function parseAlignmentManifestJson(json: string): AlignmentManifestJson {
  let v: unknown;
  try {
    v = JSON.parse(json) as unknown;
  } catch {
    throw new Error('alignments manifest: invalid JSON');
  }
  if (!isRecord(v)) throw new Error('alignments manifest: expected object');
  const version = v.version;
  const sourcesRaw = v.sources;
  if (typeof version !== 'string' || !Array.isArray(sourcesRaw)) {
    throw new Error('alignments manifest: version and sources[] required');
  }
  const sources: AlignmentManifestJson['sources'] = [];
  for (const s of sourcesRaw) {
    if (!isRecord(s)) continue;
    const id = s.id;
    const directory = s.directory;
    if (typeof id !== 'string' || typeof directory !== 'string') continue;
    sources.push({
      id,
      directory,
      language: typeof s.language === 'string' ? s.language : undefined,
      identifier: typeof s.identifier === 'string' ? s.identifier : undefined,
      version: typeof s.version === 'string' ? s.version : undefined,
    });
  }
  return { version, sources };
}

export function serializeAlignmentManifestJson(m: AlignmentManifestJson): string {
  return `${JSON.stringify(m, null, 2)}\n`;
}

export function parseBookAlignmentDocument(json: string): AlignmentDocument {
  return parseAlignmentJson(json);
}

export function serializeBookAlignmentDocument(doc: AlignmentDocument): string {
  return serializeAlignmentJson(doc);
}

/** Minimal reader for DCS contents or local FS adapters. */
export type ExternalFileReader = {
  readText(path: string): Promise<string>;
};

export type ExternalFileWriter = {
  writeText(path: string, content: string): Promise<void>;
};

export async function loadAlignmentManifest(reader: ExternalFileReader): Promise<AlignmentManifestJson> {
  const text = await reader.readText(ALIGNMENTS_MANIFEST_PATH);
  return parseAlignmentManifestJson(text);
}

export async function loadBookAlignment(
  reader: ExternalFileReader,
  sourceDirectory: string,
  bookCode: string,
): Promise<AlignmentDocument | null> {
  const path = alignmentBookFilePath(sourceDirectory, bookCode);
  try {
    const text = await reader.readText(path);
    return parseBookAlignmentDocument(text);
  } catch {
    return null;
  }
}

export async function saveBookAlignment(
  writer: ExternalFileWriter,
  sourceDirectory: string,
  bookCode: string,
  doc: AlignmentDocument,
): Promise<void> {
  const path = alignmentBookFilePath(sourceDirectory, bookCode);
  await writer.writeText(path, serializeBookAlignmentDocument(doc));
}

/**
 * Browser File System Access API: read a file from a handle tree.
 * Pass `root` = repo root handle; paths use `/` segments.
 */
export async function readTextFromDirectoryHandle(
  root: FileSystemDirectoryHandle,
  relativePath: string,
): Promise<string> {
  const parts = relativePath.split('/').filter(Boolean);
  if (parts.length === 0) throw new Error('empty path');
  let dir: FileSystemDirectoryHandle = root;
  for (let i = 0; i < parts.length - 1; i++) {
    dir = await dir.getDirectoryHandle(parts[i]!, { create: false });
  }
  const file = await dir.getFileHandle(parts[parts.length - 1]!, { create: false });
  const blob = await file.getFile();
  return await blob.text();
}

export async function writeTextToDirectoryHandle(
  root: FileSystemDirectoryHandle,
  relativePath: string,
  content: string,
): Promise<void> {
  const parts = relativePath.split('/').filter(Boolean);
  if (parts.length === 0) throw new Error('empty path');
  let dir: FileSystemDirectoryHandle = root;
  for (let i = 0; i < parts.length - 1; i++) {
    dir = await dir.getDirectoryHandle(parts[i]!, { create: true });
  }
  const file = await dir.getFileHandle(parts[parts.length - 1]!, { create: true });
  const w = await file.createWritable();
  await w.write(content);
  await w.close();
}

/** Build {@link ExternalFileReader} from a directory handle (repo root). */
export function directoryHandleReader(root: FileSystemDirectoryHandle): ExternalFileReader {
  return {
    readText: (path) => readTextFromDirectoryHandle(root, path),
  };
}

export function directoryHandleWriter(root: FileSystemDirectoryHandle): ExternalFileWriter {
  return {
    writeText: (path, content) => writeTextToDirectoryHandle(root, path, content),
  };
}
