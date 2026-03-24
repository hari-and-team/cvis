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

export interface RunSessionStartRequest {
  binaryPath: string;
  args?: string[];
}

export interface RunSessionStartResult {
  success: boolean;
  sessionId?: string;
  status?: RunSessionStatus;
  done?: boolean;
  inputClosed?: boolean;
  timedOut?: boolean;
  outputLimitHit?: boolean;
  stopRequested?: boolean;
  completionReason?: string | null;
  exitSignal?: string | null;
  error?: string;
}

export interface RunSessionInputRequest {
  sessionId: string;
  input: string;
}

export interface RunSessionInputResult {
  success: boolean;
  error?: string;
}

export interface RunSessionEofResult {
  success: boolean;
  status?: RunSessionStatus;
  inputClosed?: boolean;
  error?: string;
}

export type RunSessionStatus =
  | 'running'
  | 'stopping'
  | 'stopped'
  | 'completed'
  | 'failed'
  | 'timed_out'
  | 'output_limited';

export interface RunSessionPollResult {
  success: boolean;
  sessionId: string;
  status?: RunSessionStatus;
  output: string;
  stdout: string;
  stderr: string;
  done: boolean;
  exitCode: number | null;
  executionTime: number;
  inputClosed?: boolean;
  timedOut?: boolean;
  outputLimitHit?: boolean;
  stopRequested?: boolean;
  completionReason?: string | null;
  exitSignal?: string | null;
  error?: string;
}

// ===== TRACING =====
export interface TraceRequest {
  code: string;
  breakpoints?: number[];  // line numbers
  input?: string;
}

export interface StackFrame {
  name: string;
  locals: Record<string, any>;
}

export interface TraceRuntimeSnapshot {
  globals: Record<string, any>;
  frames: StackFrame[];
  flatMemory: Record<string, any>;
}

export interface TraceStep {
  stepNumber: number;
  lineNo: number;
  description?: string;
  registers: Record<string, number>;
  memory: Record<string, any>;
  stackFrames?: StackFrame[];  // Call stack with local variables
  runtime?: TraceRuntimeSnapshot;
  instructionPointer: string;
  timestamp: number;
}

export interface TraceResult {
  success: boolean;
  steps: TraceStep[];
  totalSteps: number;
  errors: string[];
}

// ===== INTENT ANALYSIS =====
export interface AnalyzeIntentRequest {
  code: string;
}

export interface AnalyzeIntentResult {
  success: boolean;
  engine: string;
  primaryIntent: string;
  primaryLabel: string;
  confidence: number;
  matchedSignals: string[];
}

// ===== CODE ANALYSIS =====
export type TokenType = 
  | 'preprocessor'  // #include, #define, etc.
  | 'type'          // int, float, char, void, struct, etc.
  | 'keyword'       // if, return, for, while, etc.
  | 'stdlib'        // printf, scanf, malloc, etc.
  | 'function'      // user function calls (identifier before '(')
  | 'identifier'    // variable names
  | 'number'        // 42, 3.14, 0xFF
  | 'string'        // "hello", 'a'
  | 'operator'      // +, -, ->, ==, ;, etc.
  | 'comment'       // // and /* */
  | 'whitespace'    // spaces, tabs, newlines
  | 'unknown';      // unrecognized

export interface CodeToken {
  type: TokenType;
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
