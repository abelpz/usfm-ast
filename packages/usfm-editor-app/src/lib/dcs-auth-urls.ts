/** Normalize host to hostname only (no protocol, no path). */
export function normalizeDcsHost(host: string): string {
  let h = host.trim();
  if (!h) return 'git.door43.org';
  h = h.replace(/^https?:\/\//i, '');
  const slash = h.indexOf('/');
  if (slash >= 0) h = h.slice(0, slash);
  return h.trim().toLowerCase() || 'git.door43.org';
}

export function dcsSignUpUrl(host: string): string {
  const h = normalizeDcsHost(host);
  return `https://${h}/user/sign_up`;
}

export function dcsForgotPasswordUrl(host: string): string {
  const h = normalizeDcsHost(host);
  return `https://${h}/user/forgot_password`;
}
