# usfm-ast

## Performance Testing

The USFM parser includes a performance monitoring system to track and compare performance across different versions and implementations. This helps identify performance regressions and validate optimizations.

### Running Performance Tests

You can run performance tests using the `usfm-perf` command:

```shell
# Basic performance test
npx usfm-perf

# Watch mode for development
npx usfm-perf --watch
```

### Command Options

- `--important` or `-i`: Mark results as important (won't be automatically pruned)
- `--version` or `-v`: Set version identifier for the test run
- `--description` or `-d`: Add a description to the test run
- `--watch` or `-w`: Run in watch mode
- `--prune` or `-p`: Remove all non-important results
- `--remove-version` or `-r`: Remove all results for a specific version
- `--help`: Show all available options

Examples:

```shell
# Save baseline performance
npx usfm-perf --important --version=baseline --description="Initial baseline measurement"

# Test after optimization
npx usfm-perf --version=optimized --description="After parsing optimization"

# Mark important milestone
npx usfm-perf --important --version=1.0.0 --description="Version 1.0.0 performance"

# Quick baseline and comparison
# First run saves baseline, second run compares with it
npx usfm-perf --important --version=baseline && npx usfm-perf --version=current

# Prune non-important results
npx usfm-perf --prune

# Remove all results for a specific version
npx usfm-perf --remove-version baseline
```

### Understanding Results

The performance tests measure:

1. Parsing performance for different input sizes
2. Visitor pattern performance (HTML, USX, USJ conversion)
3. Specific operations (paragraphs, character markers, footnotes, nested markers)

Results are displayed in three sections:

1. Current Run Results: Shows timing for the current test run
2. Comparison with Previous Run: Shows changes from the previous version
3. Data Management Info: Shows stored results statistics

Example output:

```text
Current Run Results:
┌─────────┬──────────┬────────────┬───────────┬──────────┐
│ Method  │Input Size│ Time (ms)  │Operations │ Ops/ms   │
├─────────┼──────────┼────────────┼───────────┼──────────┤
│parse-sm │    30    │   0.567    │     1     │   1.76   │
│parse-lg │   1889   │   1.007    │     1     │   0.99   │
└─────────┴──────────┴────────────┴───────────┴──────────┘

Comparison with Previous Run:
┌─────────┬──────────────┬───────────────┬───────────┬───────────┐
│ Method  │ Current (ms) │ Previous (ms) │ Diff (ms) │ Change %  │
├─────────┼──────────────┼───────────────┼───────────┼───────────┤
│parse-sm │    0.567     │     0.683     │  -0.116   │  -16.94%  │
└─────────┴──────────────┴───────────────┴───────────┴───────────┘
```

### Best Practices

1. **Establishing Baselines**
   - Before making performance-critical changes, save a baseline:

     ```shell
     npx usfm-perf --important --version=baseline --description="Pre-optimization baseline"
     ```

2. **Testing Optimizations**
   - After making changes, compare with baseline:

     ```shell
     npx usfm-perf --version=optimized
     ```

3. **Version Milestones**
   - Mark important versions for long-term tracking:

     ```shell
     npx usfm-perf --important --version=1.0.0 --description="Version 1.0.0 release"
     ```

4. **Development Workflow**
   - Use watch mode during development:

     ```shell
     npx usfm-perf --watch
     ```

### Comparing Performance

There are several ways to compare performance between different versions:

1. **Quick Baseline Comparison**

   ```shell
   # Save baseline and compare in one command
   npx usfm-perf --important --version=baseline && npx usfm-perf --version=current
   ```

2. **Multiple Version Comparison**

   ```shell
   # Save baseline
   npx usfm-perf --important --version=v1 --description="Version 1"
   
   # Compare with version 2
   npx usfm-perf --version=v2 --description="Version 2"
   
   # Compare with version 3
   npx usfm-perf --version=v3 --description="Version 3"
   ```

3. **Before/After Optimization**

   ```shell
   # Before changes
   npx usfm-perf --important --version=before --description="Before optimization"
   
   # Make your changes, then compare
   npx usfm-perf --version=after --description="After optimization"
   ```

The comparison output shows:

- Absolute time differences in milliseconds
- Percentage changes in performance
- Operations per millisecond for each test
- Automatic highlighting of significant changes

### Data Management

Performance results are stored in `src/grammar/__tests__/performance-results.json`. The system:

- Keeps the most recent results per version (default: 5)
- Maintains a history of recent versions (default: 3)
- Preserves results marked as important indefinitely
- Automatically prunes old results

### Adding New Tests

To add new performance tests, modify `src/grammar/__tests__/parser.performance.test.ts`. Follow these guidelines:

1. Group related operations in a single test
2. Use realistic input sizes
3. Measure both simple and complex cases
4. Add appropriate descriptions for important results
