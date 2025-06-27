import fs from 'fs';
import path from 'path';

interface Result {
  method: string;
  inputSize: number;
  time: number;
  operations: number;
  opsPerMs: number;
  version: string;
  isImportant?: boolean;
  description?: string;
  timestamp: number;
}

export class PerformanceMonitor {
  private results: Result[] = [];
  private previousResults: Result[] = [];
  private resultsPath = path.join(__dirname, 'performance-results.json');

  constructor() {
    this.loadPreviousResults();
  }

  private loadPreviousResults() {
    try {
      if (fs.existsSync(this.resultsPath)) {
        const data = fs.readFileSync(this.resultsPath, 'utf8');
        this.previousResults = JSON.parse(data);
      }
    } catch (error) {
      console.error('Error loading previous results:', error);
      this.previousResults = [];
    }
  }

  getPreviousResults(): Result[] {
    return this.previousResults;
  }

  measure(
    method: string,
    input: string,
    operations: number,
    fn: () => void,
    isImportant?: boolean,
    description?: string
  ) {
    const version = process.env.PERF_VERSION || 'current';
    const start = performance.now();
    fn();
    const end = performance.now();
    const time = end - start;
    
    const result: Result = {
      method,
      inputSize: input.length,
      time,
      operations,
      opsPerMs: operations / time,
      version,
      isImportant,
      description,
      timestamp: Date.now()
    };

    this.results.push(result);
  }

  saveResults() {
    try {
      let allResults = this.previousResults;
      
      // Add new results
      allResults = [...allResults, ...this.results];
      
      // Sort by timestamp (newest first)
      allResults.sort((a, b) => b.timestamp - a.timestamp);
      
      fs.writeFileSync(this.resultsPath, JSON.stringify(allResults, null, 2));
    } catch (error) {
      console.error('Error saving results:', error);
    }
  }

  printResults() {
    const isFromHistory = this.previousResults.some(r => r.version === this.results[0]?.version);
    
    // Print current results
    console.log('\nCurrent Run Results:');
    console.log(`Version: ${this.results[0]?.version} ${isFromHistory ? '(from results history)' : '(new results)'}`);
    if (this.results[0]?.description) {
      console.log(`Description: ${this.results[0].description}`);
    }
    console.log('┌─────────┬──────────┬────────────┬───────────┬──────────┐');
    console.log('│ Method  │Input Size│ Time (ms)  │Operations │ Ops/ms   │');
    console.log('├─────────┼──────────┼────────────┼───────────┼──────────┤');

    for (const result of this.results) {
      console.log(
        `│${result.method.padEnd(8)} │` +
        `${result.inputSize.toString().padEnd(9)} │` +
        `${result.time.toFixed(3).padEnd(11)} │` +
        `${result.operations.toString().padEnd(10)} │` +
        `${result.opsPerMs.toFixed(2).padEnd(9)} │`
      );
    }
    console.log('└─────────┴──────────┴────────────┴───────────┴──────────┘');

    // Print comparison if we have previous results
    const prevResults = this.previousResults.filter(r => r.version !== this.results[0]?.version);
    if (prevResults.length > 0) {
      console.log('\nComparison with Previous Run:');
      const compareVersion = prevResults[0].version;
      console.log(`Comparing with version: ${compareVersion}`);
      console.log('┌─────────┬──────────────┬───────────────┬───────────┬───────────┐');
      console.log('│ Method  │ Current (ms) │ Previous (ms) │ Diff (ms) │ Change %  │');
      console.log('├─────────┼──────────────┼───────────────┼───────────┼───────────┤');

      for (const current of this.results) {
        const previous = prevResults.find(r => r.method === current.method);
        if (previous) {
          const diff = current.time - previous.time;
          const changePercent = ((diff / previous.time) * 100).toFixed(2);
          const changeSymbol = diff > 0 ? '+' : '';
          
          console.log(
            `│${current.method.padEnd(8)} │` +
            `${current.time.toFixed(3).padEnd(13)} │` +
            `${previous.time.toFixed(3).padEnd(12)} │` +
            `${(changeSymbol + diff.toFixed(3)).padEnd(10)} │` +
            `${(changeSymbol + changePercent).padEnd(9)}% │`
          );
        }
      }
      console.log('└─────────┴──────────────┴───────────────┴───────────┴───────────┘');
    }
  }
} 