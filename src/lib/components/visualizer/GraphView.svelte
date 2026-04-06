<script lang="ts">
  import type { VisualizerGraph } from '$lib/visualizer/trace-normalization';

  export let graphs: VisualizerGraph[] = [];

  const NODE_RADIUS = 24;
  const CANVAS_WIDTH = 420;
  const CANVAS_HEIGHT = 280;
  const CENTER_X = CANVAS_WIDTH / 2;
  const CENTER_Y = CANVAS_HEIGHT / 2;

  interface PositionedGraphNode {
    id: string;
    label: string;
    visited: boolean;
    displayLabel: string;
    x: number;
    y: number;
  }

  interface PositionedGraphEdge {
    id: string;
    from: string;
    to: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    selfLoop: boolean;
  }

  interface PositionedGraph {
    id: string;
    markerId: string;
    label: string;
    directed: boolean;
    nodes: PositionedGraphNode[];
    edges: PositionedGraphEdge[];
    visitedCount: number;
  }

  function formatNodeLabel(label: string): string {
    const normalized = String(label ?? '').trim();
    if (!normalized) {
      return '?';
    }

    return normalized.length > 7 ? `${normalized.slice(0, 6)}...` : normalized;
  }

  function nodeFontSize(label: string): number {
    if (label.length >= 7) return 9;
    if (label.length >= 5) return 10;
    return 12;
  }

  function markerIdFor(id: string): string {
    return `graph-arrow-${id.replace(/[^A-Za-z0-9_-]/g, '-')}`;
  }

  function edgeEndpoint(
    from: PositionedGraphNode,
    to: PositionedGraphNode,
    direction: 1 | -1
  ): { x: number; y: number } {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.hypot(dx, dy) || 1;
    const unitX = dx / distance;
    const unitY = dy / distance;

    return {
      x: direction === 1 ? from.x + unitX * NODE_RADIUS : to.x - unitX * (NODE_RADIUS + 6),
      y: direction === 1 ? from.y + unitY * NODE_RADIUS : to.y - unitY * (NODE_RADIUS + 6)
    };
  }

  function buildPositionedGraph(graph: VisualizerGraph): PositionedGraph {
    const radius = Math.min(CANVAS_WIDTH, CANVAS_HEIGHT) * 0.34;
    const orderedNodes = graph.nodes.slice().sort((left, right) =>
      left.id.localeCompare(right.id, undefined, { numeric: true })
    );
    const nodes = orderedNodes.map((node, index): PositionedGraphNode => {
      const angle =
        orderedNodes.length === 1
          ? -Math.PI / 2
          : -Math.PI / 2 + (index / orderedNodes.length) * Math.PI * 2;

      return {
        ...node,
        displayLabel: formatNodeLabel(node.label),
        x: orderedNodes.length === 1 ? CENTER_X : CENTER_X + Math.cos(angle) * radius,
        y: orderedNodes.length === 1 ? CENTER_Y : CENTER_Y + Math.sin(angle) * radius
      };
    });
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const edges = graph.edges.flatMap((edge, index): PositionedGraphEdge[] => {
      const from = nodeById.get(edge.from);
      const to = nodeById.get(edge.to);
      if (!from || !to) {
        return [];
      }

      if (from.id === to.id) {
        return [{
          id: `${edge.from}-${edge.to}-${index}`,
          from: edge.from,
          to: edge.to,
          x1: from.x,
          y1: from.y,
          x2: to.x,
          y2: to.y,
          selfLoop: true
        }];
      }

      const start = edgeEndpoint(from, to, 1);
      const end = edgeEndpoint(from, to, -1);

      return [{
        id: `${edge.from}-${edge.to}-${index}`,
        from: edge.from,
        to: edge.to,
        x1: start.x,
        y1: start.y,
        x2: end.x,
        y2: end.y,
        selfLoop: false
      }];
    });

    return {
      id: graph.id,
      markerId: markerIdFor(graph.id),
      label: graph.label,
      directed: graph.directed,
      nodes,
      edges,
      visitedCount: nodes.filter((node) => node.visited).length
    };
  }

  $: positionedGraphs = graphs.map(buildPositionedGraph);
</script>

<section class="viz-section">
  <div class="section-header">
    <span class="section-label">Graph</span>
    <div class="section-rule"></div>
  </div>
  <div class="graph-stack">
    {#each positionedGraphs as graph}
      <article class="graph-card">
        <div class="graph-head">
          <div class="graph-title-block">
            <span class="graph-name">{graph.label}</span>
            <span class="graph-caption">C adjacency data rendered as node-link graph</span>
          </div>
          <span class="graph-meta">
            {graph.nodes.length} nodes &middot; {graph.edges.length} edges
            {#if graph.visitedCount > 0}
              &middot; {graph.visitedCount} visited
            {/if}
          </span>
        </div>

        <div class="graph-canvas-shell">
          <svg
            class="graph-canvas"
            viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
            role="img"
            aria-label={`Graph visualization for ${graph.label}`}
          >
            <defs>
              <marker
                id={graph.markerId}
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" class="graph-arrow-head"></path>
              </marker>
            </defs>

            {#each graph.edges as edge}
              {#if edge.selfLoop}
                <path
                  class="graph-edge"
                  d={`M ${edge.x1} ${edge.y1 - NODE_RADIUS} C ${edge.x1 + 46} ${edge.y1 - 72}, ${edge.x1 + 74} ${edge.y1 - 16}, ${edge.x1 + NODE_RADIUS} ${edge.y1 - 2}`}
                  marker-end={`url(#${graph.markerId})`}
                />
              {:else}
                <line
                  class="graph-edge"
                  x1={edge.x1}
                  y1={edge.y1}
                  x2={edge.x2}
                  y2={edge.y2}
                  marker-end={graph.directed ? `url(#${graph.markerId})` : undefined}
                />
              {/if}
            {/each}

            {#each graph.nodes as node}
              <g transform={`translate(${node.x} ${node.y})`} class="graph-node-group">
                <title>{node.label}{node.visited ? ' visited' : ''}</title>
                <circle
                  class="graph-node-circle"
                  class:graph-node-visited={node.visited}
                  r={NODE_RADIUS}
                ></circle>
                <text
                  class="graph-node-label"
                  text-anchor="middle"
                  dominant-baseline="middle"
                  style={`font-size: ${nodeFontSize(node.displayLabel)}px;`}
                >
                  {node.displayLabel}
                </text>
              </g>
            {/each}
          </svg>
        </div>

        {#if graph.visitedCount > 0}
          <div class="graph-legend">
            <span class="graph-legend-dot"></span>
            <span>Highlighted nodes are marked by C visited/seen state.</span>
          </div>
        {/if}

        <div class="graph-node-grid">
          {#each graph.nodes as node}
            <span class="graph-node-chip" class:graph-node-chip-visited={node.visited}>{node.label}</span>
          {/each}
        </div>
        <div class="graph-edge-list">
          {#each graph.edges as edge}
            <span class="graph-edge-chip">{edge.from} -&gt; {edge.to}</span>
          {/each}
        </div>
      </article>
    {/each}
  </div>
</section>

<style>
  .graph-title-block {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .graph-caption {
    color: color-mix(in srgb, var(--text-mid) 82%, var(--text-dim));
    font-size: 10px;
  }

  .graph-canvas-shell {
    overflow-x: auto;
    border-radius: 14px;
    border: 1px solid color-mix(in srgb, var(--cyan) 18%, var(--border));
    background:
      radial-gradient(circle at center, color-mix(in srgb, var(--cyan) 8%, transparent), transparent 62%),
      color-mix(in srgb, var(--bg-card) 62%, var(--bg-deep));
  }

  .graph-canvas {
    display: block;
    min-width: 340px;
    width: 100%;
    height: auto;
  }

  .graph-edge {
    stroke: color-mix(in srgb, var(--green) 70%, #e8fff3 20%);
    stroke-width: 2.4;
    stroke-linecap: round;
    fill: none;
    opacity: 0.88;
  }

  .graph-arrow-head {
    fill: color-mix(in srgb, var(--green) 70%, #e8fff3 20%);
  }

  .graph-node-circle {
    fill: color-mix(in srgb, var(--bg-raised) 82%, var(--bg-deep));
    stroke: color-mix(in srgb, var(--cyan) 76%, #fff 12%);
    stroke-width: 3;
    filter: drop-shadow(0 8px 18px color-mix(in srgb, var(--cyan) 16%, transparent));
  }

  .graph-node-circle.graph-node-visited {
    fill: color-mix(in srgb, var(--green) 22%, var(--bg-raised));
    stroke: color-mix(in srgb, var(--green) 82%, #fff 12%);
    filter: drop-shadow(0 8px 18px color-mix(in srgb, var(--green) 22%, transparent));
  }

  .graph-node-label {
    fill: var(--text-bright);
    font-weight: 900;
    pointer-events: none;
    user-select: none;
  }

  .graph-legend {
    display: flex;
    align-items: center;
    gap: 8px;
    color: color-mix(in srgb, var(--text-mid) 84%, var(--text-dim));
    font-size: 10px;
    line-height: 1.5;
  }

  .graph-legend-dot {
    width: 10px;
    height: 10px;
    border-radius: 999px;
    background: var(--green);
    box-shadow: 0 0 10px color-mix(in srgb, var(--green) 32%, transparent);
    flex-shrink: 0;
  }

  .graph-node-chip.graph-node-chip-visited {
    border-color: color-mix(in srgb, var(--green) 42%, transparent);
    color: var(--green);
    background: color-mix(in srgb, var(--green) 10%, var(--bg-card));
  }
</style>
