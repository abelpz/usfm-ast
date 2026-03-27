import { USFMParser } from '@usfm-tools/parser';
import { HTMLVisitor, USXVisitor, USJVisitor } from '../src';
import { PerformanceMonitor } from './PerformanceMonitor';

describe('USFM Adapter Performance', () => {
  const monitor = new PerformanceMonitor();
  const isImportant = process.env.PERF_IMPORTANT === 'true';
  const version = process.env.PERF_VERSION || 'current';
  const description = process.env.PERF_DESC || undefined;
  let parser: USFMParser;

  // Print version info at the start
  console.log(
    `\nRunning USFM adapter performance tests for version: ${version}${description ? ` (${description})` : ''}\n`
  );

  beforeEach(() => {
    parser = new USFMParser();
  });

  afterAll(() => {
    monitor.printResults();
    monitor.saveResults();
  });

  test('measures HTML visitor performance', () => {
    const input = `\\p First paragraph with \\bd bold\\bd* text.
    \\p Second paragraph with \\it italic\\it* and \\bd\\it nested\\it* styles\\bd*.
    \\p Third paragraph with \\f + \\fr 1.1 \\ft footnote\\f* reference.`;

    parser.load(input).parse();

    // HTML Visitor
    monitor.measure(
      'html-vis',
      input,
      1,
      () => {
        const htmlVisitor = new HTMLVisitor();
        parser.visit(htmlVisitor);
      },
      isImportant,
      description
    );
  });

  test('measures USX visitor performance', () => {
    const input = `\\p First paragraph with \\bd bold\\bd* text.
    \\p Second paragraph with \\it italic\\it* and \\bd\\it nested\\it* styles\\bd*.
    \\p Third paragraph with \\f + \\fr 1.1 \\ft footnote\\f* reference.`;

    parser.load(input).parse();

    // USX Visitor
    monitor.measure(
      'usx-vis',
      input,
      1,
      () => {
        const usxVisitor = new USXVisitor();
        parser.visit(usxVisitor);
      },
      isImportant,
      description
    );
  });

  test('measures USJ visitor performance', () => {
    const input = `\\p First paragraph with \\bd bold\\bd* text.
    \\p Second paragraph with \\it italic\\it* and \\bd\\it nested\\it* styles\\bd*.
    \\p Third paragraph with \\f + \\fr 1.1 \\ft footnote\\f* reference.`;

    parser.load(input).parse();

    // USJ Visitor
    monitor.measure(
      'usj-vis',
      input,
      1,
      () => {
        const usjVisitor = new USJVisitor();
        parser.visit(usjVisitor);
      },
      isImportant,
      description
    );
  });

  test('measures all visitor performance with different input sizes', () => {
    // Small input
    const smallInput = '\\p This is a simple paragraph.';

    // Medium input with nested markers
    const mediumInput = `\\p First paragraph with \\bd bold\\bd* text.
    \\p Second paragraph with \\it italic\\it* and \\bd\\it nested\\it* styles\\bd*.
    \\p Third paragraph with \\f + \\fr 1.1 \\ft footnote\\f* reference.`;

    // Large input with complex nesting
    const largeInput = Array(10).fill(mediumInput).join('\n');

    [
      { name: 'small', input: smallInput },
      { name: 'medium', input: mediumInput },
      { name: 'large', input: largeInput },
    ].forEach(({ name, input }) => {
      parser.load(input).parse();

      // HTML Visitor
      monitor.measure(
        `html-vis-${name}`,
        input,
        1,
        () => {
          const htmlVisitor = new HTMLVisitor();
          parser.visit(htmlVisitor);
        },
        isImportant,
        description
      );

      // USX Visitor
      monitor.measure(
        `usx-vis-${name}`,
        input,
        1,
        () => {
          const usxVisitor = new USXVisitor();
          parser.visit(usxVisitor);
        },
        isImportant,
        description
      );

      // USJ Visitor
      monitor.measure(
        `usj-vis-${name}`,
        input,
        1,
        () => {
          const usjVisitor = new USJVisitor();
          parser.visit(usjVisitor);
        },
        isImportant,
        description
      );
    });
  });

  test('measures visitor memory usage and cleanup', () => {
    const input = `\\p First paragraph with \\bd bold\\bd* text.
    \\p Second paragraph with \\it italic\\it* and \\bd\\it nested\\it* styles\\bd*.
    \\p Third paragraph with \\f + \\fr 1.1 \\ft footnote\\f* reference.`;

    parser.load(input).parse();

    // Test multiple visitor cycles to check for memory leaks
    monitor.measure(
      'html-vis-cycles',
      input,
      10,
      () => {
        for (let i = 0; i < 10; i++) {
          const htmlVisitor = new HTMLVisitor();
          parser.visit(htmlVisitor);
        }
      },
      isImportant,
      description
    );

    monitor.measure(
      'usx-vis-cycles',
      input,
      10,
      () => {
        for (let i = 0; i < 10; i++) {
          const usxVisitor = new USXVisitor();
          parser.visit(usxVisitor);
        }
      },
      isImportant,
      description
    );

    monitor.measure(
      'usj-vis-cycles',
      input,
      10,
      () => {
        for (let i = 0; i < 10; i++) {
          const usjVisitor = new USJVisitor();
          parser.visit(usjVisitor);
        }
      },
      isImportant,
      description
    );
  });

  test('measures comparative visitor performance', () => {
    const input = `\\p First paragraph with \\bd bold\\bd* text.
    \\p Second paragraph with \\it italic\\it* and \\bd\\it nested\\it* styles\\bd*.
    \\p Third paragraph with \\f + \\fr 1.1 \\ft footnote\\f* reference.`;

    parser.load(input).parse();

    // Run all visitors with the same input to compare performance
    const visitors = [
      { name: 'html', visitor: () => new HTMLVisitor() },
      { name: 'usx', visitor: () => new USXVisitor() },
      { name: 'usj', visitor: () => new USJVisitor() },
    ];

    visitors.forEach(({ name, visitor }) => {
      monitor.measure(
        `${name}-vis-compare`,
        input,
        5, // Run 5 times for better average
        () => {
          const v = visitor();
          parser.visit(v);
        },
        isImportant,
        description
      );
    });
  });
});
