import type { CodeAnalysis, CodeToken } from './types';

// Two-character operators
const TWO_CHAR_OPS = ["==", "!=", "<=", ">=", "&&", "||", "++", "--", "+=", "-=", "*=", "/=", "%=", "->"];

// C keywords
const KEYWORDS = new Set([
  "int", "float", "double", "char", "void", "return", "if", "else", "while", "for",
  "do", "break", "continue", "struct", "typedef", "sizeof", "long", "short",
  "unsigned", "signed", "const", "static", "NULL", "true", "false",
  "printf", "scanf", "fprintf", "sprintf", "stderr", "stdout",
]);

interface Token {
  t: string;
  v: string | number;
  line: number;
}

// Tokenize C code into internal token format
function tokenizeInternal(src: string): Token[] {
  const tokens: Token[] = [];
  let lineNo = 1;
  let i = 0;

  while (i < src.length) {
    const line = lineNo;
    const ch = src[i];
    
    if (ch === "\n") {
      lineNo++;
      i++;
      continue;
    }
    
    if (ch === " " || ch === "\t" || ch === "\r") {
      i++;
      continue;
    }

    // Single-line comment
    if (ch === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    
    // Multi-line comment
    if (ch === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) {
        if (src[i] === "\n") lineNo++;
        i++;
      }
      i += 2;
      continue;
    }

    // Preprocessor directive
    if (ch === "#") {
      let s = "";
      while (i < src.length && src[i] !== "\n") {
        s += src[i++];
      }
      tokens.push({ t: "prep", v: s.trim(), line });
      continue;
    }

    // String literal
    if (ch === '"') {
      let s = "";
      i++;
      while (i < src.length && src[i] !== '"') {
        if (src[i] === "\\") {
          i++;
          const e = src[i];
          s += e === "n" ? "\n" : e === "t" ? "\t" : e === "\\" ? "\\" : e === '"' ? '"' : e === "0" ? "\0" : e === "r" ? "\r" : e;
        } else {
          s += src[i];
        }
        i++;
      }
      i++;
      tokens.push({ t: "str", v: s, line });
      continue;
    }

    // Character literal
    if (ch === "'") {
      let s = "";
      i++;
      while (i < src.length && src[i] !== "'") {
        if (src[i] === "\\") {
          i++;
          s += src[i] === "n" ? "\n" : src[i] === "0" ? "\0" : src[i];
        } else {
          s += src[i];
        }
        i++;
      }
      i++;
      tokens.push({ t: "num", v: s.length ? s.charCodeAt(0) : 0, line });
      continue;
    }

    // Number literal
    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(src[i + 1] || ""))) {
      let n = "";
      while (i < src.length && /[0-9a-fA-FxX._eE]/.test(src[i])) {
        n += src[i++];
      }
      tokens.push({ t: "num", v: parseFloat(n) || 0, line });
      continue;
    }

    // Identifier or keyword
    if (/[a-zA-Z_]/.test(ch)) {
      let w = "";
      while (i < src.length && /[a-zA-Z0-9_]/.test(src[i])) {
        w += src[i++];
      }
      tokens.push({ t: KEYWORDS.has(w) ? "kw" : "id", v: w, line });
      continue;
    }

    // Shift operators
    if (ch === "<" && src[i + 1] === "<") {
      tokens.push({ t: "op", v: "LSHIFT", line });
      i += 2;
      continue;
    }
    if (ch === ">" && src[i + 1] === ">") {
      tokens.push({ t: "op", v: "RSHIFT", line });
      i += 2;
      continue;
    }

    // Two-character operators
    const two = src.slice(i, i + 2);
    if (TWO_CHAR_OPS.includes(two)) {
      tokens.push({ t: "op", v: two, line });
      i += 2;
      continue;
    }

    // Single character
    tokens.push({ t: "p", v: ch, line });
    i++;
  }
  
  tokens.push({ t: "eof", v: "", line: lineNo });
  return tokens;
}

// Convert internal tokens to CodeToken format for export
export function tokenize(code: string): CodeToken[] {
  const internalTokens = tokenizeInternal(code);
  const codeTokens: CodeToken[] = [];

  for (const token of internalTokens) {
    if (token.t === "eof") continue;

    let type: CodeToken['type'] = 'unknown';
    if (token.t === "kw") type = 'keyword';
    else if (token.t === "id") type = 'identifier';
    else if (token.t === "num") type = 'number';
    else if (token.t === "str") type = 'string';
    else if (token.t === "op" || token.t === "p") type = 'operator';

    codeTokens.push({
      type,
      value: String(token.v),
      line: token.line,
      column: 0 // Column info not available in original tokenizer
    });
  }

  return codeTokens;
}

// Preprocess code (handle simple #define directives)
function preprocessCode(code: string): string {
  return (code || "").replace(/^\s*#define\s+(\w+)\s+([^\r\n]+)\s*$/gm, "const int $1 = $2;");
}

// Extract function names from tokens
function extractFunctions(tokens: Token[]): string[] {
  const functions: string[] = [];
  
  for (let i = 0; i < tokens.length - 1; i++) {
    if (tokens[i].t === "id" && tokens[i + 1].v === "(") {
      functions.push(String(tokens[i].v));
    }
  }
  
  return Array.from(new Set(functions));
}

// Extract variable declarations
function extractVariables(tokens: Token[]): string[] {
  const variables: string[] = [];
  const typeKeywords = new Set(["int", "float", "double", "char", "void", "long", "short", "unsigned", "signed"]);
  
  for (let i = 0; i < tokens.length - 1; i++) {
    if (tokens[i].t === "kw" && typeKeywords.has(String(tokens[i].v))) {
      // Skip pointer asterisk if present
      let j = i + 1;
      if (tokens[j].v === "*") j++;
      
      // Next should be identifier
      if (tokens[j] && tokens[j].t === "id") {
        variables.push(String(tokens[j].v));
      }
    }
  }
  
  return Array.from(new Set(variables));
}

// Extract struct definitions
function extractStructs(tokens: Token[]): string[] {
  const structs: string[] = [];
  
  for (let i = 0; i < tokens.length - 1; i++) {
    if (tokens[i].t === "kw" && tokens[i].v === "struct") {
      if (tokens[i + 1] && tokens[i + 1].t === "id") {
        structs.push(String(tokens[i + 1].v));
      }
    }
    
    if (tokens[i].t === "kw" && tokens[i].v === "typedef") {
      let j = i + 1;
      if (tokens[j] && tokens[j].v === "struct") {
        j++;
        if (tokens[j] && tokens[j].t === "id") {
          structs.push(String(tokens[j].v));
        }
      }
    }
  }
  
  return Array.from(new Set(structs));
}

// Analyze C code and extract functions, variables, structs
export function analyzeCode(code: string): CodeAnalysis {
  try {
    const src = preprocessCode(code);
    const internalTokens = tokenizeInternal(src);
    const codeTokens = tokenize(code);
    
    return {
      tokens: codeTokens,
      functions: extractFunctions(internalTokens),
      variables: extractVariables(internalTokens),
      structs: extractStructs(internalTokens)
    };
  } catch (error) {
    // Return empty analysis on error
    return {
      tokens: [],
      functions: [],
      variables: [],
      structs: []
    };
  }
}

// Format output for display (escape HTML and preserve whitespace)
export function formatOutput(raw: string): string {
  if (!raw) return "";
  
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>")
    .replace(/\t/g, "&nbsp;&nbsp;&nbsp;&nbsp;")
    .replace(/ /g, "&nbsp;");
}
