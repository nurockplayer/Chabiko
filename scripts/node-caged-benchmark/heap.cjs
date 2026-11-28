// One stream per isolate. RSS is sampled centrally so threads never double count it.
const { appendFileSync } = require('node:fs');
const { threadId } = require('node:worker_threads');
const { performance, PerformanceObserver } = require('node:perf_hooks');

const peak = { heapUsed: 0, heapTotal: 0, external: 0 };
let gcCount = 0;
let gcMs = 0;
const recordGC = (entries) => {
  for (const entry of entries) {
    gcCount++;
    gcMs += entry.duration;
  }
};
const observer = new PerformanceObserver((list) => recordGC(list.getEntries()));
observer.observe({ entryTypes: ['gc'] });

function sample() {
  const memory = process.memoryUsage();
  for (const key of Object.keys(peak)) peak[key] = Math.max(peak[key], memory[key]);
}
const timer = setInterval(sample, 50).unref();
sample();
process.once('exit', () => {
  sample();
  recordGC(observer.takeRecords());
  clearInterval(timer);
  appendFileSync(process.env.BENCH_HEAP, JSON.stringify({
    ...peak, gcCount, gcMs, elapsedMs: performance.now(), pid: process.pid, threadId,
    command: process.argv.slice(0, 3),
  }) + '\n');
});
