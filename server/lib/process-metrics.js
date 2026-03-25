import pidusage from 'pidusage';

const SAMPLE_INTERVAL_MS = 50;

export function trackChildProcessMetrics(child) {
  let peakMemoryBytes = 0;

  const sample = async () => {
    if (!child.pid) return;

    try {
      const stats = await pidusage(child.pid);
      if (typeof stats.memory === 'number' && Number.isFinite(stats.memory)) {
        peakMemoryBytes = Math.max(peakMemoryBytes, stats.memory);
      }
    } catch {
      // The child may already have exited; keep the last observed peak sample.
    }
  };

  const timer = setInterval(() => {
    void sample();
  }, SAMPLE_INTERVAL_MS);
  timer.unref?.();

  void sample();

  return {
    async stop() {
      clearInterval(timer);
      await sample();
      return peakMemoryBytes > 0 ? peakMemoryBytes : null;
    }
  };
}
