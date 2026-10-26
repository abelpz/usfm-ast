import { describe, expect, it } from 'vitest';
import { PING_FRAME, PONG_FRAME } from '../src/protocol';
import { parseRoom } from '../src/door43';

describe('relay protocol frames', () => {
  it('matches editor-core WebSocketRelayTransport ping/pong', () => {
    expect(PING_FRAME).toBe('{"type":"ping"}');
    expect(PONG_FRAME).toBe('{"type":"pong"}');
  });
});

describe('Door43 rooms', () => {
  it('reads host|owner/repo|key', () => {
    expect(parseRoom('qa.door43.org|es-419_gl/es-419_tn|EST.12.notas-textos')).toEqual({ host: 'qa.door43.org', owner: 'es-419_gl', repo: 'es-419_tn', key: 'EST.12.notas-textos' });
    expect(parseRoom('localhost:8798|es-419_gl/es-419_tn|EST.97.notas-textos')?.host).toBe('localhost:8798');
  });

  it('rejects a room without its three parts', () => {
    expect(parseRoom('room-1')).toBeNull();
    expect(parseRoom('qa.door43.org|es-419_gl|EST')).toBeNull();
    expect(parseRoom('qa.door43.org|es-419_gl/es-419_tn|')).toBeNull();
    expect(parseRoom('https://qa.door43.org|es-419_gl/es-419_tn|k')).toBeNull();
  });
});
