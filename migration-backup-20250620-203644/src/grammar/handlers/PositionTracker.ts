export class PositionTracker {
  private pos: number = 0;
  private positionVisits: Map<number, number> = new Map();
  private readonly MAX_VISITS = 1000;
  private currentMethod: string = '';
  private readonly trackPositions: boolean;

  constructor(trackPositions: boolean) {
    this.trackPositions = trackPositions;
  }

  movePosition(delta: number, trackVisits: boolean = false, method?: string): void {
    if (method) {
      this.currentMethod = method;
    }

    if (trackVisits && this.trackPositions) {
      const visits = this.positionVisits.get(this.pos) || 0;
      this.positionVisits.set(this.pos, visits + 1);

      if (visits > this.MAX_VISITS) {
        throw new Error(
          `Potential infinite loop detected in ${this.currentMethod} at position ${this.pos}.`
        );
      }
    }

    this.pos += delta;
  }

  advance(trackVisits: boolean = false): void {
    this.movePosition(1, trackVisits);
  }

  retreat(trackVisits: boolean = false): void {
    this.movePosition(-1, trackVisits);
  }

  setPosition(newPos: number, trackVisits: boolean = false): void {
    const delta = newPos - this.pos;
    this.movePosition(delta, trackVisits);
  }

  getPosition(): number {
    return this.pos;
  }

  savePosition(): number {
    return this.pos;
  }

  restorePosition(savedPos: number, trackVisits: boolean = false): void {
    this.setPosition(savedPos, trackVisits);
  }

  clear(): void {
    this.pos = 0;
    this.positionVisits.clear();
  }
}
