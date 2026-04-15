# @usfm-tools/door43-rest

Shared **Gitea Contents API** helpers for `git.door43.org` (and compatible hosts): list directory, read file (base64-decoded UTF-8), create/update file, delete file.

Kept dependency-free so `@usfm-tools/editor-app` and `@usfm-tools/editor-adapters` can share the same implementation. Aligns with `packages/door43/src/repo-contents.ts` in **biblia-studio** where applicable.
