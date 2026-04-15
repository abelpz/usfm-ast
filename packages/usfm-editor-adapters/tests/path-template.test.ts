import { formatHelpsPathTemplate } from '../src/helps/path-template';

describe('formatHelpsPathTemplate', () => {
  it('replaces book token case-insensitively', () => {
    expect(formatHelpsPathTemplate('twl_{book}.tsv', 'tit')).toBe('twl_TIT.tsv');
    expect(formatHelpsPathTemplate('TN_{BOOK}.tsv', 'gen')).toBe('TN_GEN.tsv');
  });
});
