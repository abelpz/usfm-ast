import type { Operation } from '../operations';
import { transformOpLists } from '../ot-transform';

/**
 * Pluggable merge of local pending content ops vs incoming remote ops (e.g. OT, CRDT, or pass-through).
 * Receives {@link contentOnly} lists — alignment ops are stripped before merge.
 */
export interface MergeStrategy {
  merge(
    localPending: Operation[],
    remoteOps: Operation[]
  ): { serverPrime: Operation[]; clientPrime: Operation[] };
}

/** Default: chapter-scoped OT via {@link transformOpLists} (server applied first). */
export class OTMergeStrategy implements MergeStrategy {
  merge(localPending: Operation[], remoteOps: Operation[]): {
    serverPrime: Operation[];
    clientPrime: Operation[];
  } {
    return transformOpLists(localPending, remoteOps);
  }
}
