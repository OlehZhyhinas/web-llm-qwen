export class PromptLookupIndex {
  private source: number[];
  private nMin: number;
  private nMax: number;
  private readonly ngramEnds = new Map<string, number[]>();

  constructor(source: number[] = [], nMin = 2, nMax = 3) {
    if (!Number.isInteger(nMin) || nMin < 1) {
      throw new Error("nMin must be a positive integer.");
    }
    if (!Number.isInteger(nMax) || nMax < nMin) {
      throw new Error("nMax must be an integer >= nMin.");
    }
    this.nMin = nMin;
    this.nMax = nMax;
    this.source = [];
    if (source.length > 0) {
      this.appendTokens(source);
    }
  }

  setRange(nMin: number, nMax: number): void {
    if (!Number.isInteger(nMin) || nMin < 1) {
      throw new Error("nMin must be a positive integer.");
    }
    if (!Number.isInteger(nMax) || nMax < nMin) {
      throw new Error("nMax must be an integer >= nMin.");
    }
    if (this.nMin === nMin && this.nMax === nMax) {
      return;
    }
    const sourceCopy = [...this.source];
    this.nMin = nMin;
    this.nMax = nMax;
    this.reset(sourceCopy);
  }

  reset(source: number[] = []): void {
    this.source = [];
    this.ngramEnds.clear();
    if (source.length > 0) {
      this.appendTokens(source);
    }
  }

  appendToken(token: number): void {
    this.source.push(token);
    const end = this.source.length - 1;
    for (let n = this.nMin; n <= this.nMax; ++n) {
      if (this.source.length < n) {
        continue;
      }
      const key = this.source.slice(this.source.length - n).join(",");
      const ends = this.ngramEnds.get(key);
      if (ends === undefined) {
        this.ngramEnds.set(key, [end]);
      } else {
        ends.push(end);
      }
    }
  }

  appendTokens(tokens: number[]): void {
    for (const token of tokens) {
      this.appendToken(token);
    }
  }

  draft(k: number): number[] {
    if (!Number.isFinite(k) || k < 1) {
      return [];
    }
    const limit = Math.floor(k);
    if (this.source.length === 0) {
      return [];
    }
    const queryEnd = this.source.length - 1;
    for (let n = this.nMax; n >= this.nMin; --n) {
      if (this.source.length < n) {
        continue;
      }
      const key = this.source.slice(this.source.length - n).join(",");
      const ends = this.ngramEnds.get(key);
      if (ends === undefined || ends.length === 0) {
        continue;
      }
      let candidateEnd = -1;
      for (let i = ends.length - 1; i >= 0; --i) {
        if (ends[i] < queryEnd) {
          candidateEnd = ends[i];
          break;
        }
      }
      if (candidateEnd < 0) {
        continue;
      }
      const begin = candidateEnd + 1;
      const end = Math.min(begin + limit, this.source.length);
      if (begin >= end) {
        continue;
      }
      return this.source.slice(begin, end);
    }
    return [];
  }

  getSource(): readonly number[] {
    return this.source;
  }
}
