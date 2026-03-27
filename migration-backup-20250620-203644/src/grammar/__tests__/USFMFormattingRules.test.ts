import {
  USFMFormatter,
  USFMFormattingRuleMatcher,
  coreUSFMFormattingRules,
  USFMFormattingRule,
  MarkerType,
  ExceptionContext,
} from '../handlers/USFMFormattingRules';

describe('USFM Formatting Rules System', () => {
  describe('USFMFormattingRuleMatcher', () => {
    let matcher: USFMFormattingRuleMatcher;

    beforeEach(() => {
      matcher = new USFMFormattingRuleMatcher(coreUSFMFormattingRules);
    });

    describe('findMatchingRule', () => {
      it('should find rules by marker type', () => {
        const rule = matcher.findMatchingRule('p', 'paragraph');
        expect(rule).toBeTruthy();
        expect(rule?.applies.type).toBe('paragraph');
      });

      it('should find rules by specific marker', () => {
        const rule = matcher.findMatchingRule('v', 'character');
        expect(rule).toBeTruthy();
        expect(
          ['v', 'c'].includes(rule?.applies.marker as string) || rule?.applies.type === 'character'
        ).toBe(true);
      });

      it('should find rules by pattern', () => {
        // Test table cell pattern
        const rule = matcher.findMatchingRule('th1', 'character');
        expect(rule).toBeTruthy();
      });

      it('should return highest priority rule when multiple match', () => {
        const testRules: USFMFormattingRule[] = [
          {
            id: 'low-priority',
            description: 'Low priority test',
            priority: 10,
            applies: { marker: 'test' },
            whitespace: { before: { type: 'space' } },
          },
          {
            id: 'high-priority',
            description: 'High priority test',
            priority: 100,
            applies: { marker: 'test' },
            whitespace: { before: { type: 'newline' } },
          },
        ];

        const testMatcher = new USFMFormattingRuleMatcher(testRules);
        const rule = testMatcher.findMatchingRule('test');

        expect(rule?.id).toBe('high-priority');
        expect(rule?.priority).toBe(100);
      });

      it('should return null when no rules match', () => {
        const rule = matcher.findMatchingRule('nonexistent-marker');
        expect(rule).toBeNull();
      });
    });

    describe('getWhitespaceRule', () => {
      it('should return before whitespace rule', () => {
        const rule = matcher.getWhitespaceRule('p', 'paragraph', 'before');
        expect(rule).toBeTruthy();
        expect(rule?.type).toBeTruthy();
      });

      it('should return after whitespace rule', () => {
        const rule = matcher.getWhitespaceRule('p', 'paragraph', 'after');
        expect(rule).toBeTruthy();
        expect(rule?.type).toBeTruthy();
      });

      it('should handle exception contexts', () => {
        const rule = matcher.getWhitespaceRule('p', 'paragraph', 'before', 'document-start');
        // Should either return a rule or handle the exception
        expect(rule).toBeTruthy();
      });

      it('should return null for non-existent markers', () => {
        const rule = matcher.getWhitespaceRule('nonexistent', 'paragraph', 'before');
        expect(rule).toBeNull();
      });
    });
  });

  describe('USFMFormatter', () => {
    let formatter: USFMFormatter;

    beforeEach(() => {
      formatter = new USFMFormatter(coreUSFMFormattingRules);
    });

    describe('getMarkerWhitespace', () => {
      it('should return appropriate whitespace for paragraph markers', () => {
        const before = formatter.getMarkerWhitespace('p', 'paragraph', undefined, 'before');
        const after = formatter.getMarkerWhitespace('p', 'paragraph', undefined, 'after');

        expect(typeof before).toBe('string');
        expect(typeof after).toBe('string');
      });

      it('should return appropriate whitespace for character markers', () => {
        const before = formatter.getMarkerWhitespace('w', 'character', undefined, 'before');
        const after = formatter.getMarkerWhitespace('w', 'character', undefined, 'after');

        expect(typeof before).toBe('string');
        expect(typeof after).toBe('string');
      });

      it('should handle space count correctly', () => {
        const testRules: USFMFormattingRule[] = [
          {
            id: 'multi-space-test',
            description: 'Multi space test',
            priority: 100,
            applies: { marker: 'test' },
            whitespace: {
              before: { type: 'space', count: 3 },
              after: { type: 'space', count: 2 },
            },
          },
        ];

        const testFormatter = new USFMFormatter(testRules);
        const before = testFormatter.getMarkerWhitespace('test', 'character', undefined, 'before');
        const after = testFormatter.getMarkerWhitespace('test', 'character', undefined, 'after');

        expect(before).toBe('   '); // 3 spaces
        expect(after).toBe('  '); // 2 spaces
      });

      it('should handle newline whitespace', () => {
        const testRules: USFMFormattingRule[] = [
          {
            id: 'newline-test',
            description: 'Newline test',
            priority: 100,
            applies: { marker: 'test' },
            whitespace: {
              before: { type: 'newline' },
            },
          },
        ];

        const testFormatter = new USFMFormatter(testRules);
        const whitespace = testFormatter.getMarkerWhitespace(
          'test',
          'paragraph',
          undefined,
          'before'
        );

        expect(whitespace).toBe('\n');
      });

      it('should handle none whitespace', () => {
        const testRules: USFMFormattingRule[] = [
          {
            id: 'none-test',
            description: 'None test',
            priority: 100,
            applies: { marker: 'test' },
            whitespace: {
              before: { type: 'none' },
            },
          },
        ];

        const testFormatter = new USFMFormatter(testRules);
        const whitespace = testFormatter.getMarkerWhitespace(
          'test',
          'character',
          undefined,
          'before'
        );

        expect(whitespace).toBe('');
      });

      it('should return default fallback for unknown markers', () => {
        const whitespace = formatter.getMarkerWhitespace(
          'unknown-marker',
          'character',
          undefined,
          'before'
        );
        expect(whitespace).toBe(' '); // Default fallback
      });
    });

    describe('formatMarker', () => {
      it('should format paragraph markers', () => {
        const formatting = formatter.formatMarker('p', 'paragraph');

        expect(formatting).toHaveProperty('before');
        expect(formatting).toHaveProperty('after');
        expect(typeof formatting.before).toBe('string');
        expect(typeof formatting.after).toBe('string');
      });

      it('should format character markers', () => {
        const formatting = formatter.formatMarker('w', 'character');

        expect(formatting).toHaveProperty('before');
        expect(formatting).toHaveProperty('after');
      });

      it('should handle document start context', () => {
        const normalFormatting = formatter.formatMarker(
          'p',
          'paragraph',
          undefined,
          undefined,
          false
        );
        const docStartFormatting = formatter.formatMarker(
          'p',
          'paragraph',
          undefined,
          undefined,
          true
        );

        // May be the same or different depending on rules
        expect(normalFormatting).toHaveProperty('before');
        expect(docStartFormatting).toHaveProperty('before');
      });

      it('should handle exception contexts', () => {
        const formatting = formatter.formatMarker('w', 'character', undefined, 'within-note');

        expect(formatting).toHaveProperty('before');
        expect(formatting).toHaveProperty('after');
      });
    });

    describe('formatParagraphWithContext', () => {
      it('should format paragraph with verse context', () => {
        const formatting = formatter.formatParagraphWithContext('p', 'v', 'character');

        expect(formatting).toHaveProperty('before');
        expect(formatting).toHaveProperty('after');
      });

      it('should format paragraph with text context', () => {
        const formatting = formatter.formatParagraphWithContext('p', 'w', 'character');

        expect(formatting).toHaveProperty('before');
        expect(formatting).toHaveProperty('after');
      });

      it('should handle document start', () => {
        const formatting = formatter.formatParagraphWithContext('id', undefined, undefined, true);

        expect(formatting).toHaveProperty('before');
        expect(formatting).toHaveProperty('after');
      });
    });

    describe('formatVerseWithContext', () => {
      it('should format verse after paragraph', () => {
        const formatting = formatter.formatVerseWithContext('paragraph');

        expect(formatting).toHaveProperty('before');
        expect(formatting).toHaveProperty('after');
      });

      it('should format verse after text', () => {
        const formatting = formatter.formatVerseWithContext('text');

        expect(formatting).toHaveProperty('before');
        expect(formatting).toHaveProperty('after');
      });

      it('should format verse at document start', () => {
        const formatting = formatter.formatVerseWithContext('none', true);

        expect(formatting).toHaveProperty('before');
        expect(formatting).toHaveProperty('after');
      });
    });

    describe('formatMarkerSequence', () => {
      it('should format a sequence of markers', () => {
        const markers = [
          { marker: 'id', markerType: 'paragraph' as MarkerType },
          { marker: 'c', markerType: 'paragraph' as MarkerType },
          { marker: 'p', markerType: 'paragraph' as MarkerType },
          { marker: 'v', markerType: 'character' as MarkerType },
        ];

        const formatting = formatter.formatMarkerSequence(markers);

        expect(formatting).toHaveLength(4);
        formatting.forEach((format) => {
          expect(format).toHaveProperty('before');
          expect(format).toHaveProperty('after');
        });
      });

      it('should handle empty sequence', () => {
        const formatting = formatter.formatMarkerSequence([]);
        expect(formatting).toHaveLength(0);
      });
    });
  });

  describe('Core USFM Formatting Rules', () => {
    it('should include line ending normalization rule', () => {
      const lineEndingRule = coreUSFMFormattingRules.find(
        (rule) => rule.id === 'normalize-line-endings'
      );

      expect(lineEndingRule).toBeTruthy();
      expect(lineEndingRule?.priority).toBeGreaterThan(900); // High priority
    });

    it('should include paragraph rules', () => {
      const paragraphRules = coreUSFMFormattingRules.filter(
        (rule) => rule.applies.type === 'paragraph'
      );

      expect(paragraphRules.length).toBeGreaterThan(0);
    });

    it('should include character marker rules', () => {
      const characterRules = coreUSFMFormattingRules.filter(
        (rule) => rule.applies.type === 'character'
      );

      expect(characterRules.length).toBeGreaterThan(0);
    });

    it('should include note marker rules', () => {
      const noteRules = coreUSFMFormattingRules.filter((rule) => rule.applies.type === 'note');

      expect(noteRules.length).toBeGreaterThan(0);
    });

    it('should include milestone marker rules', () => {
      const milestoneRules = coreUSFMFormattingRules.filter(
        (rule) => rule.applies.type === 'milestone'
      );

      expect(milestoneRules.length).toBeGreaterThan(0);
    });

    it('should have unique rule IDs', () => {
      const ids = coreUSFMFormattingRules.map((rule) => rule.id);
      const uniqueIds = new Set(ids);

      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should have valid priority values', () => {
      coreUSFMFormattingRules.forEach((rule) => {
        expect(rule.priority).toBeGreaterThan(0);
        expect(Number.isInteger(rule.priority)).toBe(true);
      });
    });
  });

  describe('Custom Rules Integration', () => {
    it('should allow custom rules to override core rules', () => {
      const customRules: USFMFormattingRule[] = [
        ...coreUSFMFormattingRules,
        {
          id: 'custom-paragraph-override',
          description: 'Custom paragraph formatting',
          priority: 1000, // Higher than core rules
          applies: { type: 'paragraph' },
          whitespace: {
            before: { type: 'space', count: 5 },
            after: { type: 'space', count: 5 },
          },
        },
      ];

      const formatter = new USFMFormatter(customRules);
      const formatting = formatter.formatMarker('p', 'paragraph');

      expect(formatting.before).toBe('     '); // 5 spaces
      expect(formatting.after).toBe('     '); // 5 spaces
    });

    it('should handle rule exceptions correctly', () => {
      const customRules: USFMFormattingRule[] = [
        {
          id: 'exception-test',
          description: 'Test rule with exceptions',
          priority: 100,
          applies: { marker: 'test' },
          whitespace: {
            before: { type: 'newline', exceptions: ['document-start'] },
          },
        },
      ];

      const formatter = new USFMFormatter(customRules);

      const normalFormatting = formatter.formatMarker(
        'test',
        'paragraph',
        undefined,
        undefined,
        false
      );
      const docStartFormatting = formatter.formatMarker(
        'test',
        'paragraph',
        undefined,
        'document-start',
        true
      );

      expect(normalFormatting.before).toBe('\n');
      expect(docStartFormatting.before).toBe(''); // Exception should apply
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty rules array', () => {
      const formatter = new USFMFormatter([]);
      const formatting = formatter.formatMarker('p', 'paragraph');

      // Should return default fallback
      expect(formatting.before).toBe(' ');
      expect(formatting.after).toBe('');
    });

    it('should handle malformed rules gracefully', () => {
      const malformedRules: USFMFormattingRule[] = [
        {
          id: 'malformed',
          description: 'Malformed rule',
          priority: 100,
          applies: {}, // Empty applies
          whitespace: {},
        },
      ];

      expect(() => new USFMFormatter(malformedRules)).not.toThrow();
    });

    it('should handle undefined marker types', () => {
      const formatter = new USFMFormatter(coreUSFMFormattingRules);
      const formatting = formatter.formatMarker('unknown', undefined);

      expect(formatting).toHaveProperty('before');
      expect(formatting).toHaveProperty('after');
    });
  });
});
