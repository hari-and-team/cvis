<script lang="ts">
  import type { VisualizerTree, VisualizerTreeNode } from '$lib/visualizer/trace-normalization';

  export let trees: VisualizerTree[] = [];

  const NODE_RADIUS = 32;
  const LEVEL_GAP = 106;
  const SLOT_GAP = 92;
  const PADDING_X = 44;
  const PADDING_Y = 28;
  const MIN_CARD_WIDTH = 320;

  interface PositionedTreeNode extends VisualizerTreeNode {
    x: number;
    y: number;
    displayLabel: string;
  }

  interface TreeEdge {
    id: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  }

  interface PositionedTree {
    id: string;
    width: number;
    height: number;
    nodes: PositionedTreeNode[];
    edges: TreeEdge[];
  }

  function formatNodeLabel(label: string): string {
    const normalized = String(label ?? '').trim();
    if (!normalized) {
      return '?';
    }

    return normalized.length > 9 ? `${normalized.slice(0, 8)}…` : normalized;
  }

  function nodeFontSize(label: string): number {
    if (label.length >= 9) return 10;
    if (label.length >= 6) return 11;
    return 13;
  }

  function createEdge(
    id: string,
    parent: PositionedTreeNode,
    child: PositionedTreeNode
  ): TreeEdge {
    const dx = child.x - parent.x;
    const dy = child.y - parent.y;
    const distance = Math.hypot(dx, dy) || 1;
    const unitX = dx / distance;
    const unitY = dy / distance;

    return {
      id,
      x1: parent.x + unitX * NODE_RADIUS,
      y1: parent.y + unitY * NODE_RADIUS,
      x2: child.x - unitX * (NODE_RADIUS + 6),
      y2: child.y - unitY * (NODE_RADIUS + 6)
    };
  }

  function buildPositionedTree(tree: VisualizerTree): PositionedTree {
    const maxSlots = Math.max(...tree.levels.map((level) => level.length), 1);
    const innerWidth = Math.max(MIN_CARD_WIDTH - PADDING_X * 2, maxSlots * SLOT_GAP);
    const width = innerWidth + PADDING_X * 2;
    const height =
      PADDING_Y * 2 +
      NODE_RADIUS * 2 +
      Math.max(0, tree.levels.length - 1) * LEVEL_GAP;

    const nodes: PositionedTreeNode[] = [];
    const nodeByKey = new Map<string, PositionedTreeNode>();

    tree.levels.forEach((level, levelIndex) => {
      const slotCount = Math.max(level.length, 1);
      level.forEach((node, slotIndex) => {
        if (!node) {
          return;
        }

        const x = PADDING_X + ((slotIndex + 0.5) * innerWidth) / slotCount;
        const y = PADDING_Y + NODE_RADIUS + levelIndex * LEVEL_GAP;
        const positionedNode: PositionedTreeNode = {
          ...node,
          x,
          y,
          displayLabel: formatNodeLabel(node.label)
        };

        nodes.push(positionedNode);
        nodeByKey.set(node.key, positionedNode);
      });
    });

    const edges = nodes.flatMap((node) => {
      const childPairs = [
        ['left', node.leftKey],
        ['right', node.rightKey]
      ] as const;

      return childPairs.flatMap(([side, childKey]) => {
        if (!childKey) {
          return [];
        }

        const childNode = nodeByKey.get(childKey);
        if (!childNode) {
          return [];
        }

        return [createEdge(`${node.key}-${side}-${childKey}`, node, childNode)];
      });
    });

    return {
      id: tree.id,
      width,
      height,
      nodes,
      edges
    };
  }

  $: positionedTrees = trees.map(buildPositionedTree);
</script>

<section class="viz-section">
  <div class="section-header">
    <span class="section-label">Binary Tree</span>
    <div class="section-rule"></div>
  </div>

  <div class="tree-stack">
    {#each positionedTrees as tree}
      <div class="tree-card">
        <div class="tree-meta">
          <span class="tree-meta-title">Node graph</span>
          <span class="tree-meta-copy">Data values stay inside each node, with arrows following left and right links.</span>
        </div>

        <div class="tree-canvas-shell">
          <svg
            class="tree-canvas"
            viewBox={`0 0 ${tree.width} ${tree.height}`}
            role="img"
            aria-label="Binary tree visualization"
          >
            <defs>
              <marker
                id={`tree-arrow-${tree.id}`}
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" class="tree-arrow-head"></path>
              </marker>
            </defs>

            {#each tree.edges as edge}
              <line
                x1={edge.x1}
                y1={edge.y1}
                x2={edge.x2}
                y2={edge.y2}
                class="tree-edge"
                marker-end={`url(#tree-arrow-${tree.id})`}
              />
            {/each}

            {#each tree.nodes as node}
              <g transform={`translate(${node.x} ${node.y})`} class="tree-node-group">
                <title>{node.label}</title>
                <circle class="tree-node-circle" r={NODE_RADIUS}></circle>
                <text
                  x="0"
                  y="0"
                  dy="0.35em"
                  class="tree-node-label"
                  text-anchor="middle"
                  style={`font-size: ${nodeFontSize(node.displayLabel)}px;`}
                >
                  {node.displayLabel}
                </text>
              </g>
            {/each}
          </svg>
        </div>
      </div>
    {/each}
  </div>
</section>

<style>
  .tree-stack {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .tree-card {
    border-radius: 12px;
    border: 1px solid color-mix(in srgb, var(--border) 82%, transparent);
    background:
      radial-gradient(circle at top center, color-mix(in srgb, var(--orange) 10%, transparent), transparent 55%),
      color-mix(in srgb, var(--bg-deep) 90%, transparent);
    overflow: hidden;
  }

  .tree-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 14px;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
    background: color-mix(in srgb, var(--bg-raised) 82%, var(--bg-deep));
  }

  .tree-meta-title {
    color: var(--text-bright);
    font-size: 12px;
    font-weight: 800;
  }

  .tree-meta-copy {
    color: color-mix(in srgb, var(--text-mid) 82%, var(--text-dim));
    font-size: 10px;
    text-align: right;
  }

  .tree-canvas-shell {
    overflow-x: auto;
    padding: 16px;
  }

  .tree-canvas {
    display: block;
    min-width: 100%;
    height: auto;
  }

  .tree-edge {
    stroke: color-mix(in srgb, var(--cyan) 72%, #d7f7ff 28%);
    stroke-width: 2.5;
    stroke-linecap: round;
    opacity: 0.9;
  }

  .tree-arrow-head {
    fill: color-mix(in srgb, var(--cyan) 72%, #d7f7ff 28%);
  }

  .tree-node-group {
    transform-box: fill-box;
    transform-origin: center;
  }

  .tree-node-circle {
    fill: color-mix(in srgb, var(--bg-raised) 84%, var(--bg-deep));
    stroke: color-mix(in srgb, var(--orange) 78%, #fff 12%);
    stroke-width: 3;
    filter: drop-shadow(0 8px 16px color-mix(in srgb, var(--orange) 16%, transparent));
  }

  .tree-node-label {
    fill: var(--text-bright);
    stroke: color-mix(in srgb, var(--bg-deep) 82%, transparent);
    stroke-width: 1.35px;
    paint-order: stroke fill;
    font-weight: 800;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    letter-spacing: 0.01em;
    pointer-events: none;
    user-select: none;
    text-rendering: geometricPrecision;
  }

  @media (max-width: 640px) {
    .tree-meta {
      flex-direction: column;
      align-items: flex-start;
    }

    .tree-meta-copy {
      text-align: left;
    }
  }
</style>
