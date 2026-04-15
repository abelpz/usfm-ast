/**
 * Reads QA integration-test variables from `process.env`.
 *
 * Variables come from `.env.qa` at the repo root, loaded by the Jest setup
 * file when `QA_INTEGRATION=1` is set.
 *
 * All fields are typed as `string | undefined`; callers use
 * `getQaDescribe()` to guard tests.
 */

export type QaUserEnv = {
  username: string;
  password: string;
};

export type QaEnv = {
  /** Base URL of the QA Gitea instance, e.g. `https://qa.door43.org` */
  host: string;
  users: [QaUserEnv, QaUserEnv];
  /**
   * Optional org on qa.door43.org that both users can write to.
   * When absent, tests create repos under User 1's personal account and add
   * User 2 as a collaborator automatically.
   */
  testOrg?: string;
  /** Prefix for temporary repo names created during a test run. */
  repoPrefix: string;
};

function readUser(index: 1 | 2): QaUserEnv | undefined {
  const username = process.env[`QA_USER${index}_USERNAME`]?.trim();
  const password = process.env[`QA_USER${index}_PASSWORD`]?.trim();
  if (!username || !password) return undefined;
  return { username, password };
}

/**
 * Return the full QA env config, or `undefined` if any required variable is
 * missing or empty.
 */
export function loadQaEnv(): QaEnv | undefined {
  const host = process.env.QA_HOST?.trim();
  const u1 = readUser(1);
  const u2 = readUser(2);
  const testOrg = process.env.QA_TEST_ORG?.trim() || undefined;
  const repoPrefix = process.env.QA_REPO_PREFIX?.trim() ?? 'usfm-ast-test';

  if (!host || !u1 || !u2) return undefined;
  return { host, users: [u1, u2], testOrg, repoPrefix };
}

/**
 * Returns `true` when the `QA_INTEGRATION` flag is set **and** all required
 * environment variables are present.
 */
export function isQaEnabled(): boolean {
  return process.env.QA_INTEGRATION === '1' && loadQaEnv() !== undefined;
}

/**
 * Returns a Jest `describe` function that is either the real `describe` or
 * `describe.skip` depending on whether QA credentials are available.
 *
 * Use this at the top of each integration test file so all suites in the file
 * are skipped when `QA_INTEGRATION=1` is not set or `.env.qa` is incomplete.
 *
 * @example
 * ```ts
 * const { describeQa, qa } = getQaDescribe();
 *
 * describeQa('My integration suite', () => {
 *   it('does something', async () => {
 *     // `qa` is guaranteed to be a valid QaEnv here.
 *   });
 * });
 * ```
 */
export function getQaDescribe(): {
  describeQa: jest.Describe;
  itQa: jest.It;
  qa: QaEnv;
} {
  const qa = loadQaEnv();
  const enabled = isQaEnabled() && qa !== undefined;

  if (!enabled) {
    // eslint-disable-next-line no-console
    console.log(
      '[QA] Integration tests skipped — set QA_INTEGRATION=1 and fill in .env.qa to enable them.',
    );
  }

  return {
    describeQa: enabled ? describe : describe.skip,
    itQa: enabled ? it : it.skip,
    // Safe cast: when `enabled` is false all suites are skipped so `qa` is
    // never accessed at runtime.
    qa: (qa ?? {}) as QaEnv,
  };
}
