import { USFMParser } from '../dist';
import { PerformanceMonitor } from './PerformanceMonitor';

// NOTE: Visitor performance tests moved to respective adapter packages:
// - HTMLVisitor tests → @usfm-tools/adapters
// - USXVisitor tests → @usfm-tools/adapters
// - USJVisitor tests → @usj-tools/adapters

describe('USFM Parser Performance', () => {
  const monitor = new PerformanceMonitor();
  const isImportant = process.env.PERF_IMPORTANT === 'true';
  const version = process.env.PERF_VERSION || 'current';
  const description = process.env.PERF_DESC || undefined;
  let parser: USFMParser;

  // Print version info at the start
  console.log(
    `\nRunning performance tests for version: ${version}${description ? ` (${description})` : ''}\n`
  );

  beforeEach(() => {
    parser = new USFMParser();
  });

  afterAll(() => {
    monitor.printResults();
    monitor.saveResults();
  });

  test('measures parsing performance for different input sizes', () => {
    // Small input
    const smallInput = '\\p This is a simple paragraph.';
    monitor.measure(
      'parse-sm',
      smallInput,
      1,
      () => {
        parser.load(smallInput).parse();
      },
      isImportant,
      description
    );

    // Medium input with nested markers
    const mediumInput = `\\p First paragraph with \\bd bold\\bd* text.
    \\p Second paragraph with \\it italic\\it* and \\bd\\it nested\\it* styles\\bd*.
    \\p Third paragraph with \\f + \\fr 1.1 \\ft footnote\\f* reference.`;
    monitor.measure(
      'parse-md',
      mediumInput,
      1,
      () => {
        parser.load(mediumInput).parse();
      },
      isImportant,
      description
    );

    // Large input with complex nesting
    const largeInput = Array(10).fill(mediumInput).join('\n');
    monitor.measure(
      'parse-lg',
      largeInput,
      1,
      () => {
        parser.load(largeInput).parse();
      },
      isImportant,
      description
    );
  });

  test('measures specific parsing operations', () => {
    // Measure paragraph parsing
    const paragraphInput = Array(100).fill('\\p Simple paragraph.').join('\n');
    monitor.measure(
      'para-100',
      paragraphInput,
      100,
      () => {
        parser.load(paragraphInput).parse();
      },
      isImportant,
      description
    );

    // Measure character marker parsing
    const characterInput = Array(100).fill('\\bd Bold text\\bd*').join(' ');
    monitor.measure(
      'char-100',
      characterInput,
      100,
      () => {
        parser.load(characterInput).parse();
      },
      isImportant,
      description
    );

    // Measure footnote parsing
    const footnoteInput = Array(50).fill('\\f + \\fr 1.1 \\ft Note text\\f*').join(' ');
    monitor.measure(
      'foot-50',
      footnoteInput,
      50,
      () => {
        parser.load(footnoteInput).parse();
      },
      isImportant,
      description
    );

    // Measure nested marker parsing
    const nestedInput = Array(50).fill('\\bd Text \\it nested\\it* more\\bd*').join(' ');
    monitor.measure(
      'nest-50',
      nestedInput,
      50,
      () => {
        parser.load(nestedInput).parse();
      },
      isImportant,
      description
    );
  });

  test('measures parser memory usage and cleanup', () => {
    const input = `\\p First paragraph with \\bd bold\\bd* text.
    \\p Second paragraph with \\it italic\\it* and \\bd\\it nested\\it* styles\\bd*.
    \\p Third paragraph with \\f + \\fr 1.1 \\ft footnote\\f* reference.`;

    // Test multiple parse cycles to check for memory leaks
    monitor.measure(
      'parse-cycles',
      input,
      10,
      () => {
        for (let i = 0; i < 10; i++) {
          parser.load(input).parse();
        }
      },
      isImportant,
      description
    );
  });
});
