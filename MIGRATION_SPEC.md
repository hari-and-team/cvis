# C DSA Visualizer: React→SvelteKit + JS→TypeScript + WASM→GCC Migration

## AGENT HANDOFF DOCUMENT - Use this as context for agentic coding

---

## PROJECT OVERVIEW

**Current State:**
- React 19 + Vite + JavaScript (untyped)
- Client-side WASM compilation via @chriskoch/cpp-wasm
- 4 components: EditorPane, Visualizer, RightPane, HeaderBar
- Tailwind CSS styling
- Location: `/home/karthi/cvis`

**Target State:**
- SvelteKit + TypeScript
- Server-side GCC compilation via Express backend
- Same 4 components (converted to `.svelte`)
- TypeScript types throughout
- Tailwind CSS (unchanged)

**Success Criteria:**
1. SvelteKit app starts with `npm run dev`
2. Express backend responds to `POST /api/compile` with compiled C binary
3. App compiles sample C code → shows output
4. Full E2E flow works: write C → compile → run → visualize
5. No console errors

---

## PHASE 1: SVELTEKIT SCAFFOLD (Priority: P0)

### 1.1 Create SvelteKit Project
```bash
cd /tmp
npm create svelte@latest cvis-new
# Choose: TypeScript, Tailwind CSS, ESLint
cd cvis-new
npm install
```

### 1.2 Copy Configuration Files
Copy these from `/home/karthi/cvis` to new SvelteKit project:
- `tailwind.config.js` → root
- `postcss.config.js` → root
- Keep Tailwind CSS dependencies in `package.json`

### 1.3 Project Structure
```
src/
  lib/
    types.ts           ← TypeScript interfaces
    api.ts             ← HTTP client for backend
    stores.ts          ← Svelte reactive stores
    theme.ts           ← Theme constants & types
    highlight.ts       ← Syntax highlighting logic
    interpreter.ts     ← C execution interpreter (from cInterpreter.js)
    components/
      EditorPane.svelte
      Visualizer.svelte
      RightPane.svelte
      HeaderBar.svelte
  routes/
    +layout.svelte     ← Root layout (orchestrates all components)
    +page.svelte       ← Entry point
    +page.css          ← Page styles (moved from App.css)
server/
  index.js             ← Express backend
  utils.js             ← GCC compilation utilities
vite.config.ts
svelte.config.js
package.json
```

### 1.4 Configure Vite + Svelte
Create `vite.config.ts`:
```typescript
import { defineConfig } from 'vite'
import { svelte } from 'vite/plugins/svelte'

export default defineConfig({
  plugins: [svelte()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001'
    }
  }
})
```

Create `svelte.config.js`:
```javascript
import adapter from '@sveltejs/adapter-auto'
import { vitePreprocess } from 'vite-svelte-preprocess'

export default {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter()
  }
}
```

---

## PHASE 2: TYPESCRIPT TYPES (Priority: P0)

### 2.1 Create `src/lib/types.ts`
```typescript
// ===== COMPILATION =====
export interface CompileRequest {
  code: string;
  language?: string;
}

export interface CompileResult {
  success: boolean;
  binary?: string;           // path to compiled binary
  output?: string;
  errors: string[];
  warnings: string[];
  compilationTime: number;
}

// ===== EXECUTION =====
export interface ExecutionRequest {
  binaryPath: string;
  args?: string[];
  input?: string;
}

export interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  executionTime: number;
}

// ===== TRACING =====
export interface TraceRequest {
  code: string;
  breakpoints?: number[];  // line numbers
}

export interface TraceStep {
  stepNumber: number;
  lineNo: number;
  registers: Record<string, number>;
  memory: Record<string, any>;
  instructionPointer: string;
  timestamp: number;
}

export interface TraceResult {
  success: boolean;
  steps: TraceStep[];
  totalSteps: number;
  errors: string[];
}

// ===== CODE ANALYSIS =====
export interface CodeToken {
  type: 'keyword' | 'identifier' | 'number' | 'string' | 'operator' | 'comment' | 'unknown';
  value: string;
  line: number;
  column: number;
}

export interface CodeAnalysis {
  tokens: CodeToken[];
  functions: string[];
  variables: string[];
  structs: string[];
}

// ===== APPLICATION STATE =====
export interface EditorState {
  code: string;
  language: 'c';
  cursorLine: number;
  cursorColumn: number;
  isModified: boolean;
}

export interface VisualizerState {
  traceSteps: TraceStep[];
  currentStepIndex: number;
  isPlaying: boolean;
  playbackSpeed: 'slow' | 'normal' | 'fast';
}

export interface AppState {
  editor: EditorState;
  visualizer: VisualizerState;
  isCompiling: boolean;
  isRunning: boolean;
  lastCompileResult: CompileResult | null;
  lastExecutionResult: ExecutionResult | null;
  errorMessage: string | null;
}
```

---

## PHASE 3: MIGRATE COMPONENTS (Priority: P1)

### 3.1 React Components to Migrate
Source files: `/home/karthi/cvis/src/components/`

**Key points for conversion:**
- React `useState` → Svelte stores or reactive variables
- React `useEffect` → Svelte `onMount` / reactive `$:`
- React props → Svelte `export let` bindings
- React callback handlers → Svelte event handlers
- React `className` → Svelte `class:`

### 3.2 EditorPane.svelte
Source: `/home/karthi/cvis/src/components/EditorPane.jsx`

**Responsibilities:**
- Display code editor (textarea or CodeMirror)
- Syntax highlighting (use `highlight.ts`)
- Line numbers
- Playback controls (play, pause, step, reset)
- Track current line execution

**Expected props/bindings:**
- `code: string` (two-way binding with `bind:`)
- `traceSteps: TraceStep[]`
- `currentStep: number`
- `isPlaying: boolean`
- `onCompile: (code: string) => void`
- `onStep: (direction: 'next' | 'prev' | 'goto', step?: number) => void`

### 3.3 Visualizer.svelte
Source: `/home/karthi/cvis/src/components/Visualizer.jsx`

**Responsibilities:**
- Render data structures (arrays, linked lists, trees) based on trace steps
- Highlight current memory state
- Show register values
- Animate changes between steps

**Expected props:**
- `traceStep: TraceStep | null`
- `dataStructures: any[]` (from memory analysis)

### 3.4 RightPane.svelte
Source: `/home/karthi/cvis/src/components/RightPane.jsx`

**Responsibilities:**
- Display execution output (stdout)
- Show errors/warnings
- Display memory state (heap, stack)
- Show variable inspector

**Expected props:**
- `executionResult: ExecutionResult | null`
- `traceStep: TraceStep | null`

### 3.5 HeaderBar.svelte
Source: `/home/karthi/cvis/src/components/HeaderBar.jsx`

**Responsibilities:**
- Compile button
- Run button
- Menu (templates, examples)
- Theme toggle (if applicable)

**Expected emit:**
- `onCompile: () => void`
- `onRun: () => void`
- `onLoadTemplate: (template: string) => void`

### 3.6 Layout Structure

**`src/routes/+layout.svelte`:**
```svelte
<script lang="ts">
  import HeaderBar from '$lib/components/HeaderBar.svelte';
  import EditorPane from '$lib/components/EditorPane.svelte';
  import RightPane from '$lib/components/RightPane.svelte';
  import { editorCode, traceSteps, currentStep } from '$lib/stores';
</script>

<div class="app">
  <HeaderBar />
  <div class="main">
    <EditorPane />
    <RightPane />
  </div>
</div>

<style>
  .app { display: flex; flex-direction: column; height: 100vh; }
  .main { display: flex; flex: 1; }
</style>
```

**`src/routes/+page.svelte`:**
```svelte
<!-- Placeholder or can be empty; layout handles content -->
```

---

## PHASE 4: MIGRATE UTILITIES (Priority: P1)

### 4.1 `src/lib/theme.ts`
Source: `/home/karthi/cvis/src/theme.js`

Extract theme constants and convert to TypeScript types:
```typescript
export const TH = {
  bgDeep: "#0a0e1a",
  bgCard: "#0f1629",
  // ... rest of theme
} as const;

export type Theme = typeof TH;
```

### 4.2 `src/lib/highlight.ts`
Source: `/home/karthi/cvis/src/lib/highlight.js`

**Requirements:**
- Take C code string
- Return array of `CodeToken[]` with line/column info
- Identify keywords, identifiers, numbers, strings, operators, comments
- No external highlight library required (keep lightweight)

### 4.3 `src/lib/interpreter.ts`
Source: `/home/karthi/cvis/src/lib/cInterpreter.js`

**Key change:** Remove all WASM references
**New responsibilities:**
- Tokenize C code (already exists)
- Analyze code structure (find functions, variables, structs)
- Format output for visualization
- **DOES NOT compile/run** (that's the backend's job)

**Exports:**
```typescript
export function analyzeCode(code: string): CodeAnalysis { ... }
export function tokenize(code: string): CodeToken[] { ... }
export function formatOutput(raw: string): string { ... }
```

---

## PHASE 5: CREATE BACKEND API (Priority: P0)

### 5.1 Express Server: `server/index.js`

**Requirements:**
- Listen on port 3001
- CORS enabled for localhost:5173 (Vite dev server)
- 3 endpoints (see below)
- Error handling + logging
- Timeout protection (5-10s per compile)
- Temp file cleanup

```javascript
import express from 'express';
import cors from 'cors';
import { compileC, runBinary, traceExecution } from './utils.js';

const app = express();
app.use(cors());
app.use(express.json());

// POST /api/compile
app.post('/api/compile', async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'No code provided' });
  
  try {
    const result = await compileC(code);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, errors: [err.message] });
  }
});

// POST /api/run
app.post('/api/run', async (req, res) => {
  const { binaryPath, args, input } = req.body;
  if (!binaryPath) return res.status(400).json({ error: 'No binary path' });
  
  try {
    const result = await runBinary(binaryPath, args, input);
    res.json(result);
  } catch (err) {
    res.status(500).json({ exitCode: 1, stdout: '', stderr: err.message });
  }
});

// POST /api/trace
app.post('/api/trace', async (req, res) => {
  const { code, breakpoints } = req.body;
  if (!code) return res.status(400).json({ error: 'No code provided' });
  
  try {
    const result = await traceExecution(code, breakpoints || []);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, errors: [err.message], steps: [] });
  }
});

app.listen(3001, () => console.log('Backend running on :3001'));
```

### 5.2 Utilities: `server/utils.js`

```javascript
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);

export async function compileC(code) {
  const tmpDir = os.tmpdir();
  const srcFile = path.join(tmpDir, `code_${Date.now()}.c`);
  const binFile = path.join(tmpDir, `code_${Date.now()}.out`);
  
  try {
    // Write source
    await fs.writeFile(srcFile, code);
    
    // Compile with gcc
    const startTime = Date.now();
    try {
      await execAsync(`gcc -o ${binFile} ${srcFile}`, { timeout: 5000 });
    } catch (err) {
      return {
        success: false,
        errors: [err.stderr || err.message],
        warnings: [],
        compilationTime: Date.now() - startTime
      };
    }
    
    return {
      success: true,
      binary: binFile,
      output: `Compiled successfully to ${binFile}`,
      errors: [],
      warnings: [],
      compilationTime: Date.now() - startTime
    };
  } finally {
    // Cleanup
    await fs.remove(srcFile).catch(() => {});
  }
}

export async function runBinary(binaryPath, args = [], input = '') {
  try {
    const startTime = Date.now();
    const cmd = `${binaryPath} ${args.join(' ')}`;
    const { stdout, stderr } = await execAsync(cmd, {
      timeout: 5000,
      input
    });
    
    return {
      stdout,
      stderr,
      exitCode: 0,
      executionTime: Date.now() - startTime
    };
  } catch (err) {
    return {
      stdout: err.stdout || '',
      stderr: err.stderr || err.message,
      exitCode: err.code || 1,
      executionTime: 0
    };
  }
}

export async function traceExecution(code, breakpoints = []) {
  // TODO: Implement GDB tracing to capture memory states at breakpoints
  // For MVP, return empty steps
  return {
    success: true,
    steps: [],
    totalSteps: 0,
    errors: []
  };
}
```

---

## PHASE 6: API CLIENT (Priority: P1)

### 6.1 `src/lib/api.ts`

```typescript
import type { CompileRequest, CompileResult, ExecutionRequest, ExecutionResult, TraceRequest, TraceResult } from './types';

const API_BASE = typeof window !== 'undefined' ? `http://localhost:3001` : '';

export async function compileCode(req: CompileRequest): Promise<CompileResult> {
  const res = await fetch(`${API_BASE}/api/compile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req)
  });
  
  if (!res.ok) throw new Error(`Compile failed: ${res.statusText}`);
  return res.json();
}

export async function runBinary(req: ExecutionRequest): Promise<ExecutionResult> {
  const res = await fetch(`${API_BASE}/api/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req)
  });
  
  if (!res.ok) throw new Error(`Run failed: ${res.statusText}`);
  return res.json();
}

export async function traceCode(req: TraceRequest): Promise<TraceResult> {
  const res = await fetch(`${API_BASE}/api/trace`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req)
  });
  
  if (!res.ok) throw new Error(`Trace failed: ${res.statusText}`);
  return res.json();
}
```

---

## PHASE 7: SVELTE STORES (Priority: P2)

### 7.1 `src/lib/stores.ts`

```typescript
import { writable, derived } from 'svelte/store';
import type { EditorState, VisualizerState, AppState, TraceStep, CompileResult, ExecutionResult } from './types';

// Editor state
export const editorCode = writable<string>(`#include <stdio.h>

int main() {
    printf("Hello World\\n");
    return 0;
}\n`);

export const cursorLine = writable<number>(1);
export const cursorColumn = writable<number>(0);

// Visualizer state
export const traceSteps = writable<TraceStep[]>([]);
export const currentStepIndex = writable<number>(0);
export const isPlaying = writable<boolean>(false);
export const playbackSpeed = writable<'slow' | 'normal' | 'fast'>('normal');

// Execution state
export const isCompiling = writable<boolean>(false);
export const isRunning = writable<boolean>(false);
export const lastBinaryPath = writable<string | null>(null);
export const lastCompileResult = writable<CompileResult | null>(null);
export const lastExecutionResult = writable<ExecutionResult | null>(null);
export const errorMessage = writable<string | null>(null);

// Derived: current trace step
export const currentTraceStep = derived(
  [traceSteps, currentStepIndex],
  ([$steps, $index]) => $steps[$index] || null
);
```

---

## PHASE 8: WIRE COMPONENTS (Priority: P2)

### 8.1 Update Components to Use Stores & API

**EditorPane.svelte:**
```svelte
<script lang="ts">
  import { editorCode, currentStepIndex, traceSteps, isPlaying } from '$lib/stores';
  import { compileCode, runBinary } from '$lib/api';
  
  let codeValue = $editorCode;
  
  async function handleCompile() {
    const result = await compileCode({ code: codeValue });
    // Update stores...
  }
</script>

<textarea bind:value={codeValue} on:change={() => $editorCode = codeValue}></textarea>
<button on:click={handleCompile}>Compile</button>
```

Similar pattern for other components.

---

## QUICK START COMMANDS

```bash
# Phase 1: Setup
cd /tmp && npm create svelte@latest cvis-new
cd cvis-new
npm install express cors fs-extra

# Phase 2-3: Create files (use agent)
# - Create src/lib/types.ts
# - Create src/lib/theme.ts
# - Create src/lib/highlight.ts
# - etc.

# Phase 5: Backend
# - Create server/index.js
# - Create server/utils.js

# Dev run:
npm run dev &           # Terminal 1: SvelteKit on :5173
node server/index.js &  # Terminal 2: Express on :3001

# Test compile:
curl -X POST http://localhost:3001/api/compile \
  -H "Content-Type: application/json" \
  -d '{"code":"int main() { return 0; }"}'
```

---

## SUCCESS CHECKLIST

- [ ] SvelteKit dev server starts without errors
- [ ] Express backend starts on :3001
- [ ] `/api/compile` endpoint returns CompileResult (success or errors)
- [ ] `/api/run` endpoint executes binaries
- [ ] EditorPane component renders
- [ ] Can type C code in editor
- [ ] Compile button calls API
- [ ] Output displays in RightPane
- [ ] Stores update reactively in components
- [ ] No TypeScript errors
- [ ] E2E: Write C → Compile → Run → Show output

---

## NOTES FOR AGENT

- **Do not** modify existing `/home/karthi/cvis` yet—scaffold new project first
- **Use TypeScript types heavily**—they're your contract
- **Keep it simple for MVP**—trace/GDB support can come later
- **Focus on E2E flow**—don't get stuck on perfect visualization
- **Test each API endpoint independently** before wiring to frontend
- All file paths should use absolute imports from `$lib`, `$routes`, etc.

