export interface InertialScrollOptions {
  enabled?: boolean;
  multiplier?: number;
  damping?: number;
  spring?: number;
  settleThreshold?: number;
}

const DEFAULTS: Required<InertialScrollOptions> = {
  enabled: false,
  multiplier: 1,
  damping: 0.82,
  spring: 0.28,
  settleThreshold: 0.45
};

export function inertialScroll(node: HTMLElement, options: InertialScrollOptions = {}) {
  let config = { ...DEFAULTS, ...options };
  let frame: number | null = null;
  let target = node.scrollTop;
  let velocity = 0;

  function maxScrollTop() {
    return Math.max(0, node.scrollHeight - node.clientHeight);
  }

  function clamp(value: number) {
    return Math.max(0, Math.min(maxScrollTop(), value));
  }

  function stop() {
    if (frame !== null) {
      cancelAnimationFrame(frame);
      frame = null;
    }
  }

  function tick() {
    const current = node.scrollTop;
    const delta = target - current;
    velocity = velocity * config.damping + delta * config.spring;

    if (
      Math.abs(delta) < config.settleThreshold &&
      Math.abs(velocity) < config.settleThreshold
    ) {
      node.scrollTop = target;
      velocity = 0;
      stop();
      return;
    }

    node.scrollTop = clamp(current + velocity);
    frame = requestAnimationFrame(tick);
  }

  function handleWheel(event: WheelEvent) {
    if (!config.enabled || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
      return;
    }

    event.preventDefault();
    const baseline = frame === null ? node.scrollTop : target;
    target = clamp(baseline + event.deltaY * config.multiplier);

    if (frame === null) {
      velocity = 0;
      frame = requestAnimationFrame(tick);
    }
  }

  function handleNativeScroll() {
    if (frame === null) {
      target = node.scrollTop;
    }
  }

  if (config.enabled) {
    node.addEventListener('wheel', handleWheel, { passive: false });
    node.addEventListener('scroll', handleNativeScroll, { passive: true });
  }

  return {
    update(nextOptions: InertialScrollOptions = {}) {
      const wasEnabled = config.enabled;
      config = { ...DEFAULTS, ...nextOptions };
      target = clamp(target);

      if (!wasEnabled && config.enabled) {
        node.addEventListener('wheel', handleWheel, { passive: false });
        node.addEventListener('scroll', handleNativeScroll, { passive: true });
      }

      if (wasEnabled && !config.enabled) {
        stop();
        node.removeEventListener('wheel', handleWheel);
        node.removeEventListener('scroll', handleNativeScroll);
      }
    },
    destroy() {
      stop();
      if (config.enabled) {
        node.removeEventListener('wheel', handleWheel);
        node.removeEventListener('scroll', handleNativeScroll);
      }
    }
  };
}
