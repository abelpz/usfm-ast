import { StreamLanguage } from '@codemirror/language';

/** Lightweight USFM-ish highlighting: backslash markers vs body text. */
export const usfmLanguage = StreamLanguage.define({
  name: 'usfm',
  startState() {
    return null;
  },
  token(stream) {
    if (stream.peek() === '\\') {
      stream.next();
      if (stream.eat('+')) stream.match(/^[a-z][a-z0-9]*\*?/i);
      else stream.match(/^[a-z][a-z0-9]*\*?/i);
      return 'keyword';
    }
    stream.next();
    return null;
  },
});
