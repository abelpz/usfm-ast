import { describe, expect, it } from 'vitest';
import { PING_FRAME, PONG_FRAME } from '../src/protocol';

describe('relay protocol frames', () => {
  it('matches editor-core WebSocketRelayTransport ping/pong', () => {
    expect(PING_FRAME).toBe('{"type":"ping"}');
    expect(PONG_FRAME).toBe('{"type":"pong"}');
  });
});
