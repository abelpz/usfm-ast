/** Tree-shakeable Lucide ESM icon chunks (no per-file typings in the package). */
declare module 'lucide/dist/esm/icons/*.js' {
  /** Lucide {@link import('./lucide-render').IconNode} — kebab file name maps to icon. */
  const icon: import('./lucide-render').IconNode;
  export default icon;
}
