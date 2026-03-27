import { MarkerTypeEnum } from '../index';
import { MarkerHandler } from './MarkerHandler';

export class WhitespaceHandler {
  isLineBreakingWhitespace(char: string): boolean {
    return (
      char === '\n' || // Line Feed (LF)
      char === '\r' || // Carriage Return (CR)
      char === '\f' // Form Feed (page break)
    );
  }

  isNonLineBreakingWhitespace(char: string): boolean {
    return (
      char === ' ' || // Space
      char === '\t' || // Tab
      char === '\v' || // Vertical Tab
      char === '\u00A0' // Non-breaking space
    );
  }

  isWhitespace(char: string): boolean {
    return this.isLineBreakingWhitespace(char) || this.isNonLineBreakingWhitespace(char);
  }

  normalizeWhitespace(input: string, markerHandler: MarkerHandler): string {
    // First, normalize all line endings to LF
    let normalized = input.replace(/\r\n|\r/g, '\n');

    let result = '';
    let i = 0;
    let inWhitespace = false;
    let lastWasNewline = false;

    while (i < normalized.length) {
      const char = normalized[i];

      if (char === '\\') {
        const marker = this.peekNextMarker(normalized, i + 1);
        const markerInfo = markerHandler.getMarkerInfo(marker);

        if (markerInfo?.type === MarkerTypeEnum.PARAGRAPH) {
          if (!lastWasNewline && result.length > 0) {
            result = result.trimEnd() + '\n';
          }
        } else if (
          markerInfo?.type === MarkerTypeEnum.CHARACTER ||
          markerInfo?.type === MarkerTypeEnum.NOTE
        ) {
          const lastNonWhitespace = result.trimEnd();
          if (lastNonWhitespace.length > 0 && !lastWasNewline) {
            result = lastNonWhitespace + ' ';
          }
        }

        result += char;
        i++;
        lastWasNewline = false;
        inWhitespace = false;
        continue;
      }

      if (this.isWhitespace(char)) {
        if (this.isLineBreakingWhitespace(char)) {
          if (!lastWasNewline) {
            result += '\n';
          }
          lastWasNewline = true;
        } else if (!inWhitespace) {
          result += ' ';
          lastWasNewline = false;
        }
        inWhitespace = true;
      } else {
        result += char;
        inWhitespace = false;
        lastWasNewline = false;
      }
      i++;
    }

    return result;
  }

  private peekNextMarker(input: string, start: number): string {
    let marker = '';
    let i = start;

    while (i < input.length) {
      const char = input[i];
      if (this.isWhitespace(char) || char === '\\') {
        break;
      }
      if (char === '+' || char === '*') {
        return '';
      }
      marker += char;
      i++;
    }

    return marker;
  }
}
