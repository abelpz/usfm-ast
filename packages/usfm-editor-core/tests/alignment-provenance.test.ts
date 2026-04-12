import {
  alignmentSourceKey,
  checkSourceCompatibility,
  detectAlignmentState,
  parseAlignmentSource,
  parseDocumentIdentityFromUsj,
  setAlignmentSource,
} from '../src/alignment-provenance';
import type { UsjDocument } from '../src/document-store';

function usjWithRem(content: string): UsjDocument {
  return {
    type: 'USJ',
    version: '3.1',
    content: [
      { type: 'para', marker: 'rem', content: [content] },
      { type: 'chapter', marker: 'c', number: '1' },
    ] as UsjDocument['content'],
  };
}

describe('alignment-provenance', () => {
  it('parseAlignmentSource reads alignment-source line', () => {
    const u = usjWithRem('alignment-source: el-x-koine/ugnt v85');
    expect(parseAlignmentSource(u)).toEqual({
      identifier: 'el-x-koine/ugnt',
      version: '85',
    });
    expect(alignmentSourceKey(parseAlignmentSource(u)!)).toBe('el-x-koine/ugnt@85');
  });

  it('detectAlignmentState unaligned without zaln', () => {
    expect(detectAlignmentState({ content: [] })).toBe('unaligned');
  });

  it('checkSourceCompatibility allows missing rem on translation', () => {
    const trans: UsjDocument = {
      type: 'USJ',
      version: '3.1',
      content: [
        { type: 'para', marker: 'id', content: ['TIT EN ULT en English_ltr tc'] },
      ] as UsjDocument['content'],
    };
    const src: UsjDocument = {
      type: 'USJ',
      version: '3.1',
      content: [
        { type: 'para', marker: 'id', content: ['TIT GRK UGNT el-x-koine Greek_ltr tc'] },
      ] as UsjDocument['content'],
    };
    const c = checkSourceCompatibility(trans, src);
    expect(c.compatible).toBe(true);
  });

  it('parseDocumentIdentityFromUsj reads book node id (parser-style USJ)', () => {
    const u: UsjDocument = {
      type: 'USJ',
      version: '3.1',
      content: [
        { type: 'book', marker: 'id', content: ['TIT EN ULT en'] },
        { type: 'chapter', marker: 'c', number: '1' },
      ] as UsjDocument['content'],
    };
    expect(parseDocumentIdentityFromUsj(u)).toContain('TIT');
  });

  it('parseDocumentIdentityFromUsj joins book id code + trailing content (USFMParser shape)', () => {
    const u: UsjDocument = {
      type: 'USJ',
      version: '3.1',
      content: [
        {
          type: 'book',
          marker: 'id',
          code: 'el-x-koine/ugnt',
          content: ['v85 EN_TPL es-419_Español tc'],
        },
        { type: 'chapter', marker: 'c', number: '1' },
      ] as UsjDocument['content'],
    };
    const id = parseDocumentIdentityFromUsj(u);
    expect(id).toContain('el-x-koine/ugnt');
    expect(id).toContain('v85');
  });

  it('setAlignmentSource inserts rem before chapter', () => {
    const u: UsjDocument = {
      type: 'USJ',
      version: '3.1',
      content: [{ type: 'chapter', marker: 'c', number: '1' }] as UsjDocument['content'],
    };
    const next = setAlignmentSource(u, { identifier: 'el-x-koine/ugnt', version: '1' });
    const flat = JSON.stringify(next.content);
    expect(flat).toContain('alignment-source:');
    expect(flat).toContain('el-x-koine/ugnt');
  });
});
