/**
 * Deterministic PRNG (mulberry32). The host seeds one of these per match so a
 * replay of the same seed produces the same fighter draws — handy for the
 * debug mode and for reproducing a bug report.
 */
export class Random {
  private state: number;

  constructor(seed = Date.now() >>> 0) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  pick<T>(items: readonly T[]): T {
    if (!items.length) throw new Error('Random.pick on an empty list');
    return items[this.int(items.length)];
  }

  /**
   * Weighted draw. The MVP always passes equal weights (pure random, as
   * specified) but the plumbing is here so a "recently fought" penalty can be
   * added later without touching the round logic.
   */
  pickWeighted<T>(items: readonly T[], weight: (item: T) => number): T {
    const weights = items.map((i) => Math.max(0, weight(i)));
    const total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0) return this.pick(items);
    let roll = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      roll -= weights[i];
      if (roll <= 0) return items[i];
    }
    return items[items.length - 1];
  }

  /** Draw `count` distinct entries. */
  sample<T>(items: readonly T[], count: number): T[] {
    const pool = [...items];
    const out: T[] = [];
    while (out.length < count && pool.length) {
      out.push(pool.splice(this.int(pool.length), 1)[0]);
    }
    return out;
  }
}

export const roomCode = (alphabet: string, length: number): string => {
  const rng = new Random((Math.random() * 0xffffffff) >>> 0);
  let out = '';
  for (let i = 0; i < length; i++) out += alphabet[rng.int(alphabet.length)];
  return out;
};
