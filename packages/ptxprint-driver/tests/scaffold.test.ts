import { readFile } from 'fs/promises';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { getParatextFilePrefix } from '../src/books/paratextNumber';
import { scaffoldSingleBookProject } from '../src/scaffold/scaffoldProject';

describe('scaffoldSingleBookProject', () => {
  it('writes Settings.xml, USFM, and ptxprint.cfg', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ptxtest-'));
    const projectId = 'TESTPRJ';
    const bookCode = 'JHN';
    const prefix = getParatextFilePrefix(bookCode);
    const usfm = '\\id JHN\n\\c 1\n\\v 1 Test.\n';

    try {
      await scaffoldSingleBookProject({
        projectsRoot: root,
        projectId,
        bookCode,
        usfmText: usfm,
        langIso: 'es',
        configId: 'Default',
        render: { paperSize: 'A5' },
      });

      const fname = `${prefix}${bookCode}${projectId}.usfm`;
      const written = await readFile(join(root, projectId, fname), 'utf8');
      expect(written).toContain('\\id JHN');

      const settings = await readFile(join(root, projectId, 'Settings.xml'), 'utf8');
      expect(settings).toContain('<LanguageIsoCode>es</LanguageIsoCode>');
      expect(settings).toContain(`${projectId}.usfm`);

      const cfg = await readFile(
        join(root, projectId, 'shared', 'ptxprint', 'Default', 'ptxprint.cfg'),
        'utf8',
      );
      expect(cfg).toContain(`book = ${bookCode}`);
      expect(cfg).toContain('[paper]');
      expect(cfg).toContain('148mm, 210mm (A5)');
      expect(cfg).toContain('fontfactor = 12');
      expect(cfg).toContain('rulegap = 0');
      expect(cfg).toContain('[paragraph]');
      expect(cfg).toContain('linespacing = 15');
      expect(cfg).toContain('[finishing]');
      expect(cfg).toContain('pgsperspread = 1');
      expect(cfg).toContain('sheetsize = 148mm, 210mm (A5)');
      expect(cfg).toContain('ifmainbodytext = True');
      expect(cfg).toContain('[project]');
      expect(cfg).toContain(`id = ${projectId}`);
      expect(cfg).toContain('fontregular = DejaVu Serif||false|false|');
      expect(cfg).toContain('fontbold = DejaVu Serif||false|false|embolden=2');
      expect(cfg).toContain('fontitalic = DejaVu Serif||false|false|slant=0.15');
      expect(cfg).toContain('fontbolditalic = DejaVu Serif||false|false|embolden=2|slant=0.15');
      expect(cfg).toContain('fontextraregular = ||false|false|');

      const fontPath = join(root, projectId, 'shared', 'fonts', 'SourceCodePro-Regular.ttf');
      await expect(readFile(fontPath)).resolves.toBeDefined();
      const bodyFontPath = join(root, projectId, 'shared', 'fonts', 'DejaVuSerif.ttf');
      await expect(readFile(bodyFontPath)).resolves.toBeDefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('writes Charis SIL when render.fontFamily is set', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ptxtest-'));
    const projectId = 'TESTPRJ';
    const bookCode = 'JHN';
    const usfm = '\\id JHN\n\\c 1\n\\v 1 Test.\n';

    try {
      await scaffoldSingleBookProject({
        projectsRoot: root,
        projectId,
        bookCode,
        usfmText: usfm,
        langIso: 'es',
        configId: 'Default',
        render: { paperSize: 'A5', fontFamily: 'Charis SIL' },
      });

      const cfg = await readFile(
        join(root, projectId, 'shared', 'ptxprint', 'Default', 'ptxprint.cfg'),
        'utf8',
      );
      expect(cfg).toContain('fontregular = Charis SIL||false|false|');
      expect(cfg).toContain('fontbold = Charis SIL||false|false|embolden=2');
      expect(cfg).toContain('fontitalic = Charis SIL||false|false|slant=0.15');
      expect(cfg).toContain('fontbolditalic = Charis SIL||false|false|embolden=2|slant=0.15');
      expect(cfg).toContain('fontextraregular = ||false|false|');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('merges cfgOverrides and preserves protected project keys', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ptxtest-'));
    const projectId = 'TESTPRJ';
    const bookCode = 'JHN';
    const prefix = getParatextFilePrefix(bookCode);
    const usfm = '\\id JHN\n\\c 1\n\\v 1 Test.\n';

    try {
      await scaffoldSingleBookProject({
        projectsRoot: root,
        projectId,
        bookCode,
        usfmText: usfm,
        langIso: 'es',
        configId: 'Default',
        render: {
          paperSize: 'A5',
          cfgOverrides: {
            project: { id: 'SHOULD_NOT_WIN', book: 'MAT' },
            document: { sectionheads: 'True' },
            customsection: { foo: 'bar' },
          },
        },
      });

      const fname = `${prefix}${bookCode}${projectId}.usfm`;
      await expect(readFile(join(root, projectId, fname), 'utf8')).resolves.toContain('\\id JHN');

      const cfg = await readFile(
        join(root, projectId, 'shared', 'ptxprint', 'Default', 'ptxprint.cfg'),
        'utf8',
      );
      expect(cfg).toContain(`id = ${projectId}`);
      expect(cfg).toContain(`book = ${bookCode}`);
      expect(cfg).toContain('sectionheads = True');
      expect(cfg).toMatch(/\[customsection\]/);
      expect(cfg).toContain('foo = bar');
      expect(cfg).not.toContain('SHOULD_NOT_WIN');
      expect(cfg).not.toContain('book = MAT');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
