import { USFMFormatter } from '../src/formatters/Formatter';

describe('USFMFormatter Public API', () => {
  describe('addMarker', () => {
    it('adds verse marker on new line by default', () => {
      const fmt = new USFMFormatter();
      const result = fmt.addMarker('\\p Text', 'v');
      expect(result.normalizedOutput).toBe('\\p Text\n\\v ');
    });

    it('respects versesOnNewLine: false option', () => {
      const fmt = new USFMFormatter({ versesOnNewLine: false });
      const result = fmt.addMarker('\\p Text ', 'v');
      expect(result.normalizedOutput).toBe('\\p Text \\v ');
    });

    it('respects paragraphContentOnNewLine option', () => {
      const fmt = new USFMFormatter({ paragraphContentOnNewLine: true });
      const result = fmt.addMarker('', 'p');
      expect(result.normalizedOutput).toBe('\\p\n');
    });

    it('handles id marker at document start', () => {
      const fmt = new USFMFormatter();
      const result = fmt.addMarker('', 'id');
      expect(result.normalizedOutput).toBe('\\id ');
    });

    it('normalizes trailing whitespace appropriately', () => {
      const fmt = new USFMFormatter();
      const result = fmt.addMarker('\\p Text ', 'v');
      expect(result.normalizedOutput).toBe('\\p Text \n\\v ');
    });

    it('preserves content when no normalization needed', () => {
      const fmt = new USFMFormatter();
      const result = fmt.addMarker('\\p Text\n', 'v');
      expect(result.normalizedOutput).toBe('\\p Text\n\\v ');
    });

    it('handles closing markers without trailing whitespace', () => {
      const fmt = new USFMFormatter();
      const result = fmt.addMarker('content', 'w', true);
      expect(result.normalizedOutput).toBe('content\\w*');
    });

    it('handles closing markers for different marker types', () => {
      const fmt = new USFMFormatter();

      // Character marker closing
      const charResult = fmt.addMarker('\\w word', 'w', true);
      expect(charResult.normalizedOutput).toBe('\\w word\\w*');

      // Note marker closing
      const noteResult = fmt.addMarker('\\f + footnote text', 'f', true);
      expect(noteResult.normalizedOutput).toBe('\\f + footnote text\\f*');
    });

    it('automatically detects and formats milestone markers', () => {
      const fmt = new USFMFormatter();

      // Marker ending with -s should be inferred as milestone and formatted accordingly
      const milestoneResult = fmt.addMarker('text', 'test-milestone-s');
      expect(milestoneResult.normalizedOutput).toBe('text\\test-milestone-s\\*');

      // Marker ending with -e should be inferred as milestone and formatted accordingly
      const milestoneEndResult = fmt.addMarker('content', 'test-milestone-e');
      expect(milestoneEndResult.normalizedOutput).toBe('content\\test-milestone-e\\*');

      // Verify the markers were inferred and registered as milestones
      expect(fmt.hasInferredMarkers()).toBe(true);
      const inferred = fmt.getInferredMarkers();
      expect(inferred['test-milestone-s']).toEqual({ type: 'milestone' });
      expect(inferred['test-milestone-e']).toEqual({ type: 'milestone' });
    });

    it('respects markersOnNewLine configuration when auto-detecting milestones', () => {
      const fmt = new USFMFormatter({
        markersOnNewLine: ['auto-milestone-s'],
      });

      // Even though addMarker is called, it should detect milestone and respect configuration
      const result = fmt.addMarker('text', 'auto-milestone-s');
      expect(result.normalizedOutput).toBe('text\n\\auto-milestone-s\\*');

      // Verify it was inferred as a milestone
      const inferred = fmt.getInferredMarkers();
      expect(inferred['auto-milestone-s']).toEqual({ type: 'milestone' });
    });

    it('uses regular marker formatting for non-milestone markers', () => {
      const fmt = new USFMFormatter();

      // Character marker (inline context) should not be treated as milestone
      // Should have trailing space (regular marker behavior), not \\* (milestone behavior)
      const charResult = fmt.addMarker('text', 'test-char-marker');
      expect(charResult.normalizedOutput).toBe('text\\test-char-marker ');
      expect(charResult.normalizedOutput).not.toMatch(/\\test-char-marker\\\*/);

      // Paragraph marker (after line break) should not be treated as milestone
      // Should have trailing space (regular marker behavior), not \\* (milestone behavior)
      const paraResult = fmt.addMarker('\\p Text\n', 'test-para-marker');
      expect(paraResult.normalizedOutput).toBe('\\p Text\n\\test-para-marker ');
      expect(paraResult.normalizedOutput).not.toMatch(/\\test-para-marker\\\*/);

      // Test with known character marker should also work correctly
      const knownCharResult = fmt.addMarker('word ', 'w');
      expect(knownCharResult.normalizedOutput).toBe('word \\w ');
      expect(knownCharResult.normalizedOutput).not.toMatch(/\\w\\\*/);
    });
  });

  describe('addTextContent', () => {
    it('adds verse content with proper spacing', () => {
      const fmt = new USFMFormatter();
      const withMarker = fmt.addMarker('\\p', 'v');
      const withContent = fmt.addTextContent(
        withMarker.normalizedOutput,
        '1 In the beginning was the Word'
      );
      expect(withContent.normalizedOutput).toBe('\\p\n\\v 1 In the beginning was the Word');
    });

    it('adds verse number only with structural space', () => {
      const fmt = new USFMFormatter();
      const withMarker = fmt.addMarker('\\p', 'v');
      const withContent = fmt.addTextContent(withMarker.normalizedOutput, '1');
      expect(withContent.normalizedOutput).toBe('\\p\n\\v 1 ');
    });

    it('adds chapter content with proper spacing', () => {
      const fmt = new USFMFormatter();
      const withMarker = fmt.addMarker('\\id GEN', 'c');
      const withContent = fmt.addTextContent(withMarker.normalizedOutput, '1 Creation');
      expect(withContent.normalizedOutput).toBe('\\id GEN\n\\c 1 Creation');
    });

    it('adds chapter number only without trailing space', () => {
      const fmt = new USFMFormatter();
      const withMarker = fmt.addMarker('\\id GEN', 'c');
      const withContent = fmt.addTextContent(withMarker.normalizedOutput, '1');
      expect(withContent.normalizedOutput).toBe('\\id GEN\n\\c 1');
    });

    it('adds paragraph content directly', () => {
      const fmt = new USFMFormatter();
      const withMarker = fmt.addMarker('\\c 1', 'p');
      const withContent = fmt.addTextContent(withMarker.normalizedOutput, 'This is paragraph text');
      expect(withContent.normalizedOutput).toBe('\\c 1\n\\p This is paragraph text');
    });

    it('handles empty content', () => {
      const fmt = new USFMFormatter();
      const withMarker = fmt.addMarker('\\p', 'v');
      const withContent = fmt.addTextContent(withMarker.normalizedOutput, '');
      expect(withContent.normalizedOutput).toBe('\\p\n\\v ');
    });

    it('handles content when no marker is found', () => {
      const fmt = new USFMFormatter();
      const withContent = fmt.addTextContent('plain text', ' more text');
      expect(withContent.normalizedOutput).toBe('plain text more text');
    });

    it('handles complex verse numbers', () => {
      const fmt = new USFMFormatter();
      const withMarker = fmt.addMarker('\\p', 'v');

      // Verse range
      const rangeContent = fmt.addTextContent(
        withMarker.normalizedOutput,
        '1-2 Text for verses 1 and 2'
      );
      expect(rangeContent.normalizedOutput).toBe('\\p\n\\v 1-2 Text for verses 1 and 2');

      // Verse with sub-verse
      const subContent = fmt.addTextContent(withMarker.normalizedOutput, '1.5 Mid-verse text');
      expect(subContent.normalizedOutput).toBe('\\p\n\\v 1.5 Mid-verse text');
    });

    it('works with versesOnNewLine false', () => {
      const fmt = new USFMFormatter({ versesOnNewLine: false });
      const withMarker = fmt.addMarker('\\p Text ', 'v');
      const withContent = fmt.addTextContent(withMarker.normalizedOutput, '1 Verse text');
      expect(withContent.normalizedOutput).toBe('\\p Text \\v 1 Verse text');
    });
  });

  describe('addAttributes', () => {
    it('adds single attribute with USFM | separator', () => {
      const fmt = new USFMFormatter();
      const result = fmt.addAttributes('\\w gracious', { lemma: 'grace' });
      expect(result.normalizedOutput).toBe('\\w gracious|lemma="grace"');
    });

    it('adds multiple attributes', () => {
      const fmt = new USFMFormatter();
      const result = fmt.addAttributes('\\w gracious', {
        lemma: 'grace',
        strong: 'H1234',
      });
      expect(result.normalizedOutput).toBe('\\w gracious|lemma="grace" strong="H1234"');
    });

    it('handles empty attributes', () => {
      const fmt = new USFMFormatter();
      const result = fmt.addAttributes('\\w gracious', {});
      expect(result.normalizedOutput).toBe('\\w gracious');
    });

    it('handles null/undefined attributes', () => {
      const fmt = new USFMFormatter();
      const result1 = fmt.addAttributes('\\w gracious', null as any);
      const result2 = fmt.addAttributes('\\w gracious', undefined as any);
      expect(result1.normalizedOutput).toBe('\\w gracious');
      expect(result2.normalizedOutput).toBe('\\w gracious');
    });

    it('supports multiple attribute values (comma-separated)', () => {
      const fmt = new USFMFormatter();
      const result = fmt.addAttributes('\\w gracious', {
        strong: 'H1234,G5485',
      });
      expect(result.normalizedOutput).toBe('\\w gracious|strong="H1234,G5485"');
    });

    it('supports user-defined attributes with x- prefix', () => {
      const fmt = new USFMFormatter();
      const result = fmt.addAttributes('\\w gracious', {
        lemma: 'grace',
        'x-myattr': 'value',
      });
      expect(result.normalizedOutput).toBe('\\w gracious|lemma="grace" x-myattr="value"');
    });
  });

  describe('addMilestone', () => {
    it('adds milestone without attributes and no surrounding spaces', () => {
      const fmt = new USFMFormatter();
      const result = fmt.addMilestone('text', 'zaln-s');
      expect(result.normalizedOutput).toBe('text\\zaln-s\\*');
    });

    it('adds milestone with single attribute', () => {
      const fmt = new USFMFormatter();
      const result = fmt.addMilestone('text', 'zaln-s', { who: 'Jesus' });
      expect(result.normalizedOutput).toBe('text\\zaln-s |who="Jesus"\\*');
    });

    it('adds milestone with multiple attributes', () => {
      const fmt = new USFMFormatter();
      const result = fmt.addMilestone('text', 'zaln-s', {
        'x-morph': 'Gr,N,,,,,NMS,',
        'x-occurrence': '1',
        'x-occurrences': '1',
        'x-content': 'λόγος',
      });
      expect(result.normalizedOutput).toBe(
        'text\\zaln-s |x-morph="Gr,N,,,,,NMS," x-occurrence="1" x-occurrences="1" x-content="λόγος"\\*'
      );
    });

    it('adds milestone at document start', () => {
      const fmt = new USFMFormatter();
      const result = fmt.addMilestone('', 'zaln-s');
      expect(result.normalizedOutput).toBe('\\zaln-s\\*');
    });

    it('adds milestone with empty attributes object', () => {
      const fmt = new USFMFormatter();
      const result = fmt.addMilestone('text', 'zaln-e', {});
      expect(result.normalizedOutput).toBe('text\\zaln-e\\*');
    });

    it('adds milestone with null/undefined attributes', () => {
      const fmt = new USFMFormatter();
      const result1 = fmt.addMilestone('text', 'zaln-e', null as any);
      const result2 = fmt.addMilestone('text', 'zaln-e', undefined);
      expect(result1.normalizedOutput).toBe('text\\zaln-e\\*');
      expect(result2.normalizedOutput).toBe('text\\zaln-e\\*');
    });

    it('respects markersOnNewLine configuration for milestones', () => {
      const fmt = new USFMFormatter({
        markersOnNewLine: ['zaln-s'],
      });
      const result = fmt.addMilestone('text', 'zaln-s');
      expect(result.normalizedOutput).toBe('text\n\\zaln-s\\*');
    });

    it('respects markersOnNewLine configuration for milestones with attributes', () => {
      const fmt = new USFMFormatter({
        markersOnNewLine: ['zaln-s'],
      });
      const result = fmt.addMilestone('text', 'zaln-s', { who: 'Jesus' });
      expect(result.normalizedOutput).toBe('text\n\\zaln-s |who="Jesus"\\*');
    });

    it('respects markersInline configuration for milestones', () => {
      const fmt = new USFMFormatter({
        allNonParagraphMarkersOnNewLine: true, // Would put milestones on new line
        markersInline: ['zaln-s'], // But this overrides it
      });
      const result = fmt.addMilestone('text', 'zaln-s');
      expect(result.normalizedOutput).toBe('text\\zaln-s\\*');
    });

    it('handles common alignment milestone pairs', () => {
      const fmt = new USFMFormatter();

      // Opening alignment
      let result = fmt.addMilestone('word', 'zaln-s', {
        'x-morph': 'He,Np',
        'x-occurrence': '1',
      });
      expect(result.normalizedOutput).toBe('word\\zaln-s |x-morph="He,Np" x-occurrence="1"\\*');

      // Continue building with content
      result = fmt.addTextContent(result.normalizedOutput, 'content');
      expect(result.normalizedOutput).toBe(
        'word\\zaln-s |x-morph="He,Np" x-occurrence="1"\\*content'
      );

      // Closing alignment
      result = fmt.addMilestone(result.normalizedOutput, 'zaln-e');
      expect(result.normalizedOutput).toBe(
        'word\\zaln-s |x-morph="He,Np" x-occurrence="1"\\*content\\zaln-e\\*'
      );
    });

    it('handles quotation milestone markers', () => {
      const fmt = new USFMFormatter();

      // Quote start
      let result = fmt.addMilestone('Jesus said ', 'qt-s', {
        who: 'Jesus',
        type: 'spoken',
      });
      expect(result.normalizedOutput).toBe('Jesus said \\qt-s |who="Jesus" type="spoken"\\*');

      result = fmt.addTextContent(result.normalizedOutput, 'Follow me');

      // Quote end
      result = fmt.addMilestone(result.normalizedOutput, 'qt-e');
      expect(result.normalizedOutput).toBe(
        'Jesus said \\qt-s |who="Jesus" type="spoken"\\*Follow me\\qt-e\\*'
      );
    });

    it('handles complex whitespace scenarios correctly', () => {
      const fmt = new USFMFormatter();

      // Test with existing trailing space
      let result = fmt.addMilestone('text ', 'zaln-s');
      expect(result.normalizedOutput).toBe('text \\zaln-s\\*');

      // Test with existing newline
      result = fmt.addMilestone('text\n', 'zaln-s');
      expect(result.normalizedOutput).toBe('text\n\\zaln-s\\*');

      // Test after marker
      result = fmt.addMilestone('\\p content', 'zaln-s');
      expect(result.normalizedOutput).toBe('\\p content\\zaln-s\\*');
    });

    it('works with custom milestone markers', () => {
      const fmt = new USFMFormatter({
        customMarkers: {
          'custom-milestone-s': { type: 'milestone' },
          'custom-milestone-e': { type: 'milestone' },
        },
      });

      const result = fmt.addMilestone('text', 'custom-milestone-s', {
        'custom-attr': 'value',
      });
      expect(result.normalizedOutput).toBe('text\\custom-milestone-s |custom-attr="value"\\*');
    });

    it('preserves existing marker inference behavior', () => {
      const fmt = new USFMFormatter();

      // Unknown milestone should be inferred
      fmt.addMilestone('text', 'unknown-milestone-s');

      expect(fmt.hasInferredMarkers()).toBe(true);
      const inferred = fmt.getInferredMarkers();
      expect(inferred['unknown-milestone-s']).toEqual({ type: 'milestone' });
    });

    it('handles edge case with special characters in attributes', () => {
      const fmt = new USFMFormatter();
      const result = fmt.addMilestone('text', 'zaln-s', {
        'x-content': 'word"with"quotes',
        'x-special': 'value|with|pipes',
      });
      expect(result.normalizedOutput).toBe(
        'text\\zaln-s |x-content="word"with"quotes" x-special="value|with|pipes"\\*'
      );
    });

    it('builds complete alignment example step by step', () => {
      const fmt = new USFMFormatter();

      // Start with verse
      let result = fmt.addMarker('', 'v');
      result = fmt.addTextContent(result.normalizedOutput, '1 In the beginning was the ');

      // Add alignment for "Word"
      result = fmt.addMilestone(result.normalizedOutput, 'zaln-s', {
        'x-morph': 'Gr,N,,,,,NMS,',
        'x-occurrence': '1',
        'x-occurrences': '1',
        'x-content': 'λόγος',
      });

      result = fmt.addTextContent(result.normalizedOutput, 'Word');
      result = fmt.addMilestone(result.normalizedOutput, 'zaln-e');
      result = fmt.addTextContent(result.normalizedOutput, '.');

      const expected =
        '\\v 1 In the beginning was the \\zaln-s |x-morph="Gr,N,,,,,NMS," x-occurrence="1" x-occurrences="1" x-content="λόγος"\\*Word\\zaln-e\\*.';
      expect(result.normalizedOutput).toBe(expected);
    });
  });

  describe('Complete workflow examples', () => {
    it('builds basic USFM document step by step', () => {
      const fmt = new USFMFormatter();

      // Build step by step
      let result = fmt.addMarker('', 'id');
      result = fmt.addTextContent(result.normalizedOutput, 'GEN Genesis');

      result = fmt.addMarker(result.normalizedOutput, 'c');
      result = fmt.addTextContent(result.normalizedOutput, '1');

      result = fmt.addMarker(result.normalizedOutput, 'p');

      result = fmt.addMarker(result.normalizedOutput, 'v');
      result = fmt.addTextContent(result.normalizedOutput, '1 In the beginning');

      expect(result.normalizedOutput).toBe('\\id GEN Genesis\n\\c 1\n\\p\n\\v 1 In the beginning');
    });

    it('builds USFM with character markers and attributes', () => {
      const fmt = new USFMFormatter();

      // Start with basic structure
      let result = fmt.addMarker('', 'p');
      result = fmt.addMarker(result.normalizedOutput, 'v');
      result = fmt.addTextContent(result.normalizedOutput, '1 In the beginning was the ');

      // Add character marker with attributes and content
      result = fmt.addMarker(result.normalizedOutput, 'w');
      result = fmt.addAttributes(result.normalizedOutput, { lemma: 'logos', strong: 'G3056' });
      result = fmt.addTextContent(result.normalizedOutput, 'Word');

      // Close the character marker
      result = fmt.addMarker(result.normalizedOutput, 'w', true);

      // Add more text
      result = fmt.addTextContent(result.normalizedOutput, '.');

      expect(result.normalizedOutput).toBe(
        '\\p\n\\v 1 In the beginning was the \\w |lemma="logos" strong="G3056"Word\\w*.'
      );
    });

    it('follows the expected usage pattern', () => {
      const fmt = new USFMFormatter();

      // Step 1: addMarker("", "id") produces: "\\id "
      let result = fmt.addMarker('', 'id');
      expect(result.normalizedOutput).toBe('\\id ');

      // Step 2: addTextContent("\\id ", "PSA") produces: "\\id PSA "
      result = fmt.addTextContent(result.normalizedOutput, 'PSA');
      expect(result.normalizedOutput).toBe('\\id PSA ');

      // Step 3: addMarker("\\id PSA ", "p") produces: "\\id PSA\n\\p "
      result = fmt.addMarker(result.normalizedOutput, 'p');
      expect(result.normalizedOutput).toBe('\\id PSA\n\\p ');

      // Step 4: addMarker("\\id PSA\n\\p ", "v") produces: "\\id PSA\n\\p\n\\v "
      result = fmt.addMarker(result.normalizedOutput, 'v');
      expect(result.normalizedOutput).toBe('\\id PSA\n\\p\n\\v ');

      // Step 5: addTextContent("\\id PSA\n\\p\n\\v ", "1") produces: "\\id PSA\n\\p\n\\v 1 "
      result = fmt.addTextContent(result.normalizedOutput, '1');
      expect(result.normalizedOutput).toBe('\\id PSA\n\\p\n\\v 1 ');

      // Step 6: addTextContent("\\id PSA\n\\p\n\\v 1 ", "Text") produces: "\\id PSA\n\\p\n\\v 1 Text"
      result = fmt.addTextContent(result.normalizedOutput, 'Text');
      expect(result.normalizedOutput).toBe('\\id PSA\n\\p\n\\v 1 Text');
    });
  });

  describe('Custom marker support', () => {
    it('supports custom markers via constructor', () => {
      const fmt = new USFMFormatter({
        customMarkers: {
          'custom-para': { type: 'paragraph' },
          'custom-char': { type: 'character' },
        },
      });

      const paraResult = fmt.addMarker('', 'custom-para');
      expect(paraResult.normalizedOutput).toBe('\\custom-para ');

      const charResult = fmt.addMarker('text', 'custom-char');
      expect(charResult.normalizedOutput).toBe('text\\custom-char ');
    });

    it('supports adding custom markers after construction', () => {
      const fmt = new USFMFormatter();
      fmt.addCustomMarker('my-marker', { type: 'note' });

      const result = fmt.addMarker('text', 'my-marker');
      expect(result.normalizedOutput).toBe('text\\my-marker ');
    });

    it('tracks inferred markers for user reference', () => {
      const fmt = new USFMFormatter();

      // Initially no inferred markers
      expect(fmt.hasInferredMarkers()).toBe(false);
      expect(fmt.getInferredMarkers()).toEqual({});

      // Format with unknown markers
      fmt.addMarker('\\p Text\n', 'unknown-para');
      fmt.addMarker('text', 'unknown-char');
      fmt.addMarker('text', 'inferred-milestone-s');

      // Should now have inferred markers
      expect(fmt.hasInferredMarkers()).toBe(true);

      const inferred = fmt.getInferredMarkers();
      expect(inferred).toEqual({
        'unknown-para': { type: 'paragraph' },
        'unknown-char': { type: 'character' },
        'inferred-milestone-s': { type: 'milestone' },
      });

      // User can copy this object and pass it to constructor next time
      const fmt2 = new USFMFormatter({
        customMarkers: inferred,
      });

      // Should not infer the same markers again
      fmt2.addMarker('\\p Text\n', 'unknown-para');
      expect(fmt2.hasInferredMarkers()).toBe(false);
    });

    it('allows clearing inferred markers', () => {
      const fmt = new USFMFormatter();

      fmt.addMarker('text', 'unknown-marker');
      expect(fmt.hasInferredMarkers()).toBe(true);

      fmt.clearInferredMarkers();
      expect(fmt.hasInferredMarkers()).toBe(false);
      expect(fmt.getInferredMarkers()).toEqual({});
    });
  });

  describe('Formatter options', () => {
    it('allows getting current options', () => {
      const fmt = new USFMFormatter({ versesOnNewLine: false });
      const options = fmt.getOptions();
      expect(options.versesOnNewLine).toBe(false);
      expect(options.paragraphContentOnNewLine).toBe(false); // default
    });

    it('allows updating options', () => {
      const fmt = new USFMFormatter();

      // Default behavior
      let result = fmt.addMarker('\\p Text', 'v');
      expect(result.normalizedOutput).toBe('\\p Text\n\\v ');

      // Update options
      fmt.updateOptions({ versesOnNewLine: false });

      // New behavior
      result = fmt.addMarker('\\p Text ', 'v');
      expect(result.normalizedOutput).toBe('\\p Text \\v ');
    });
  });

  describe('Granular marker control', () => {
    test('specific marker arrays take highest priority', () => {
      const formatter = new USFMFormatter({
        characterMarkersOnNewLine: false, // Broad category: inline
        markersOnNewLine: ['w'], // Specific: \w on new line
        markersInline: ['bd'], // Specific: \bd inline
      });

      // \w should be on new line (specific array overrides broad category)
      let result = formatter.addMarker('text', 'w').normalizedOutput;
      expect(result).toBe('text\n\\w ');

      // \bd should be inline (specific array)
      result = formatter.addMarker('text', 'bd').normalizedOutput;
      expect(result).toBe('text\\bd ');

      // \it should follow broad category (inline)
      result = formatter.addMarker('text ', 'it').normalizedOutput;
      expect(result).toBe('text \\it ');
    });

    test('category-wide overrides take precedence over broad categories', () => {
      const formatter = new USFMFormatter({
        characterMarkersOnNewLine: false, // Broad category: inline
        allCharacterMarkersOnNewLine: true, // Category override: all character markers on new line
        markersInline: ['bd'], // Specific: \bd inline (highest priority)
      });

      // \w should be on new line (category override)
      let result = formatter.addMarker('text', 'w').normalizedOutput;
      expect(result).toBe('text\n\\w ');

      // \bd should be inline (specific array overrides category)
      result = formatter.addMarker('text', 'bd').normalizedOutput;
      expect(result).toBe('text\\bd ');

      // \it should be on new line (category override)
      result = formatter.addMarker('text', 'it').normalizedOutput;
      expect(result).toBe('text\n\\it ');
    });

    test('allNonParagraphMarkersOnNewLine affects all non-paragraph markers', () => {
      const formatter = new USFMFormatter({
        allNonParagraphMarkersOnNewLine: true,
        markersInline: ['sup'], // Exception
      });

      // Character marker should be on new line
      let result = formatter.addMarker('text', 'w').normalizedOutput;
      expect(result).toBe('text\n\\w ');

      // Note marker should be on new line
      result = formatter.addMarker('text', 'f').normalizedOutput;
      expect(result).toBe('text\n\\f ');

      // Verse marker should be on new line
      result = formatter.addMarker('text', 'v').normalizedOutput;
      expect(result).toBe('text\n\\v ');

      // Exception: \sup should be inline
      result = formatter.addMarker('text', 'sup').normalizedOutput;
      expect(result).toBe('text\\sup ');

      formatter.updateOptions({
        allNonParagraphMarkersOnNewLine: false,
      });

      result = formatter.addMarker('text', 'f').normalizedOutput;
      expect(result).toBe('text\\f ');

      result = formatter.addMilestone('text', 'ts').normalizedOutput;
      expect(result).toBe('text\\ts\\*');

      // Paragraph marker should still be on new line (structural requirement)
      result = formatter.addMarker('text', 'p').normalizedOutput;
      expect(result).toBe('text\n\\p ');
    });

    test('note markers get appropriate inline whitespace', () => {
      const formatter = new USFMFormatter({
        markersOnNewLine: ['f'], // Force footnotes on new line
        markersInline: ['fe'], // Force endnotes inline
      });

      // \f on new line
      let result = formatter.addMarker('text', 'f').normalizedOutput;
      expect(result).toBe('text\n\\f ');

      // \fe inline with no space (note marker behavior)
      result = formatter.addMarker('text', 'fe').normalizedOutput;
      expect(result).toBe('text\\fe ');
    });

    test('updateOptions properly handles new array properties', () => {
      const formatter = new USFMFormatter();

      // Initial state
      let result = formatter.addMarker('text', 'w').normalizedOutput;
      expect(result).toBe('text\\w '); // Default: inline

      // Update to put \w on new line
      formatter.updateOptions({
        markersOnNewLine: ['w'],
      });

      result = formatter.addMarker('text', 'w').normalizedOutput;
      expect(result).toBe('text\n\\w ');

      // Update to put \w back inline
      formatter.updateOptions({
        markersOnNewLine: [], // Clear array
        markersInline: ['w'],
      });

      result = formatter.addMarker('text', 'w').normalizedOutput;
      expect(result).toBe('text\\w ');
    });

    test('complex study Bible scenario', () => {
      const formatter = new USFMFormatter({
        markersOnNewLine: ['w', 'wj'], // Word study markers on new lines
        markersInline: ['bd', 'it', 'fe'], // Common formatting inline, including endnotes
        allNoteMarkersOnNewLine: true, // All notes on new lines (except those in markersInline)
      });

      let text = '';
      text = formatter.addMarker(text, 'p').normalizedOutput;
      text = formatter.addMarker(text, 'v').normalizedOutput;
      text = formatter.addTextContent(text, '1').normalizedOutput;
      text = formatter.addTextContent(text, 'The').normalizedOutput;

      // \w should be on new line
      text = formatter.addMarker(text, 'w').normalizedOutput;
      text = formatter.addTextContent(text, 'word').normalizedOutput;
      text = formatter.addMarker(text, 'w', true).normalizedOutput;
      text = formatter.addTextContent(text, ' was ').normalizedOutput;

      // \bd should be inline
      text = formatter.addMarker(text, 'bd').normalizedOutput;
      text = formatter.addTextContent(text, 'bold').normalizedOutput;
      text = formatter.addMarker(text, 'bd', true).normalizedOutput;

      // \f should be on new line (allNoteMarkersOnNewLine)
      text = formatter.addMarker(text, 'f').normalizedOutput;
      text = formatter.addTextContent(text, '+').normalizedOutput;
      text = formatter.addTextContent(text, 'note').normalizedOutput;
      text = formatter.addMarker(text, 'f', true).normalizedOutput;

      const expected = '\\p\n\\v 1 The\n\\w word\\w* was \\bd bold\\bd*\n\\f + note\\f*';
      expect(text).toBe(expected);
    });

    test('knows the difference between significant whitespace and structural whitespace', () => {
      const formatter = new USFMFormatter({
        versesOnNewLine: true,
        markersOnNewLine: ['w'],
        markersInline: ['bd'],
      });

      let text = formatter.addMarker('', 'v').normalizedOutput;
      text = formatter.addTextContent(text, '1').normalizedOutput;
      text = formatter.addTextContent(text, 'Text ').normalizedOutput;
      text = formatter.addMarker(text, 'w').normalizedOutput;
      text = formatter.addTextContent(text, 'word').normalizedOutput;
      text = formatter.addMarker(text, 'w', true).normalizedOutput;
      expect(text).toBe('\\v 1 Text \n\\w word\\w*'); // \w is on new line because of markersOnNewLine but respects the whitespace in "Text " because it knows it is structural.
      text = formatter.addMarker(text, 'v').normalizedOutput;
      text = formatter.addTextContent(text, '2').normalizedOutput;
      expect(text).toBe('\\v 1 Text \n\\w word\\w*\n\\v 2 '); // verse number has a structural space after it.
      text = formatter.addMarker(text, 'w').normalizedOutput;
      text = formatter.addTextContent(text, 'another word').normalizedOutput;
      text = formatter.addMarker(text, 'w', true).normalizedOutput;
      expect(text).toBe('\\v 1 Text \n\\w word\\w*\n\\v 2\n\\w another word\\w*'); // the structural space after the verse number is replaced with a new line because of the w marker being on new line.
    });
  });

  describe('Closing markers', () => {
    // Add test cases for closing markers
  });
});
