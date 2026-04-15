import {
  door43WebRawFileUrl,
  helpLinksFromSupportReference,
  taArticlePathFromSupportReference,
  twArticlePathFromSupportReference,
} from '../src/helps/content-helpers';

describe('door43WebRawFileUrl', () => {
  it('builds Gitea raw URL (slashes preserved in file path)', () => {
    expect(
      door43WebRawFileUrl({
        owner: 'unfoldingWord',
        repo: 'en_tw',
        ref: 'master',
        path: 'bible/kt/grace.md',
      }),
    ).toBe('https://git.door43.org/unfoldingWord/en_tw/raw/master/bible/kt/grace.md');
  });
});

describe('twArticlePathFromSupportReference', () => {
  it('extracts bible path and adds .md', () => {
    expect(twArticlePathFromSupportReference('rc://*/tw/dict/bible/kt/grace')).toBe('bible/kt/grace.md');
  });
});

describe('taArticlePathFromSupportReference', () => {
  it('extracts TA article path', () => {
    expect(taArticlePathFromSupportReference('rc://*/ta/man/translate/figs-metaphor')).toBe(
      'translate/figs-metaphor.md',
    );
  });
});

describe('helpLinksFromSupportReference', () => {
  it('returns tw link', () => {
    const links = helpLinksFromSupportReference('rc://*/tw/dict/bible/kt/grace');
    expect(links[0]).toMatchObject({ type: 'tw', id: 'bible/kt/grace' });
  });

  it('returns ta link', () => {
    const links = helpLinksFromSupportReference('rc://*/ta/man/translate/figs-euphemism');
    expect(links[0]).toMatchObject({ type: 'ta', id: 'translate/figs-euphemism' });
  });
});
