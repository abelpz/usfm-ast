import { USFMParser } from '../dist';

describe('USFMParser logging options', () => {
  // Registry is a singleton: each test must use a distinct unknown marker so inference + warnings run again.
  const input = (suffix: string) => String.raw`\unk${suffix} trailing`;

  it('silentConsole suppresses console but keeps getLogs', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const parser = new USFMParser({ silentConsole: true });
    parser.load(input('A')).parse();
    expect(warn).not.toHaveBeenCalled();
    expect(parser.getLogs().length).toBeGreaterThan(0);
    expect(parser.getLogs().every((l) => l.type === 'warn')).toBe(true);
    warn.mockRestore();
  });

  it('logger.warn receives messages instead of console when provided', () => {
    const custom = jest.fn();
    const parser = new USFMParser({ logger: { warn: custom } });
    parser.load(input('B')).parse();
    expect(parser.getLogs().length).toBeGreaterThan(0);
    expect(custom).toHaveBeenCalled();
    expect(custom.mock.calls[0][0]).toEqual(expect.stringContaining('Unsupported marker'));
    expect(custom.mock.calls[0][0]).toContain('\\unkB');
  });

  it('defaults to console.warn when no options', () => {
    const prev = console.warn;
    const calls: string[] = [];
    console.warn = (m: string) => {
      calls.push(m);
    };
    try {
      const parser = new USFMParser();
      parser.load(input('C')).parse();
      expect(calls.length).toBeGreaterThan(0);
      expect(calls[0]).toContain('Unsupported marker');
    } finally {
      console.warn = prev;
    }
  });
});
