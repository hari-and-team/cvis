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
