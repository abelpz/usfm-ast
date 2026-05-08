import type { ProjectStorage } from '@usfm-tools/types';

/**
 * Restore all project files to their pre–bundle-import state and clear pending
 * merge conflicts. Only valid when `bundleImportSnapshot` is present on meta.
 */
export async function restoreBundleImportSnapshot(
  storage: ProjectStorage,
  projectId: string,
): Promise<void> {
  const meta = await storage.getProject(projectId);
  const snap = meta?.bundleImportSnapshot;
  if (!snap?.files) return;
  const updated = new Date().toISOString();
  for (const [path, content] of Object.entries(snap.files)) {
    if (content === null) {
      await storage.deleteFile(projectId, path);
    } else {
      await storage.writeFile(projectId, path, content);
    }
  }
  await storage.updateProject(projectId, {
    bundleImportSnapshot: undefined,
    pendingConflicts: undefined,
    updated,
  });
}
