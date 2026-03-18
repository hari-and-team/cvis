import type { CodeToken, TokenType } from './types';

// ============================================================================
// TOKEN CLASSIFICATION SETS
// ============================================================================

const TYPE_KEYWORDS = new Set([
  'int', 'float', 'double', 'char', 'void', 'long', 'short',
  'unsigned', 'signed', 'struct', 'union', 'enum', 'typedef',
  'const', 'static', 'extern', 'register', 'volatile', 'auto'
]);

const CONTROL_KEYWORDS = new Set([
  'if', 'else', 'while', 'for', 'do', 'switch', 'case', 'default',
  'break', 'continue', 'return', 'goto', 'sizeof', 'NULL'
]);

const STDLIB_FUNCTIONS = new Set([
  // stdio.h
  'printf', 'scanf', 'fprintf', 'fscanf', 'sprintf', 'sscanf',
  'fopen', 'fclose', 'fread', 'fwrite', 'fgets', 'fputs',
  'getchar', 'putchar', 'gets', 'puts', 'fgetc', 'fputc',
  'fseek', 'ftell', 'rewind', 'feof', 'ferror', 'perror',
  // stdlib.h
  'malloc', 'calloc', 'realloc', 'free', 'exit', 'abort',
  'atoi', 'atof', 'atol', 'strtol', 'strtod', 'rand', 'srand',
  'abs', 'labs', 'qsort', 'bsearch', 'system', 'getenv',
  // string.h
  'strlen', 'strcpy', 'strncpy', 'strcat', 'strncat',
  'strcmp', 'strncmp', 'strchr', 'strrchr', 'strstr',
  'memset', 'memcpy', 'memmove', 'memcmp',
  // math.h
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
  'sinh', 'cosh', 'tanh', 'exp', 'log', 'log10', 'pow', 'sqrt',
  'ceil', 'floor', 'fabs', 'fmod',
  // ctype.h
  'isalpha', 'isdigit', 'isalnum', 'isspace', 'isupper', 'islower',
  'toupper', 'tolower'
]);

const TWO_CHAR_OPERATORS = new Set([
  '==', '!=', '<=', '>=', '&&', '||', '++', '--',
  '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=',
  '<<', '>>', '->'
]);

const SINGLE_CHAR_OPERATORS = new Set([
  '+', '-', '*', '/', '%', '<', '>', '=', '!', '&', '|', '^', '~',
  '?', ':', ';', ',', '.', '(', ')', '[', ']', '{', '}'
]);

// ============================================================================
// TOKENIZER - Finite State Machine
// ============================================================================

export function tokenize(code: string): CodeToken[] {
  const tokens: CodeToken[] = [];
  if (!code) return tokens;

  let i = 0;
  let line = 1;
  let col = 1;

  const peek = (offset = 0): string => code[i + offset] || '';
  const advance = (): string => {
    const ch = code[i++];
    if (ch === '\n') {
      line++;
      col = 1;
    } else {
      col++;
    }
    return ch;
  };

  const addToken = (type: TokenType, value: string, startLine: number, startCol: number) => {
    tokens.push({ type, value, line: startLine, column: startCol });
  };

  while (i < code.length) {
    const ch = peek();
    const startLine = line;
    const startCol = col;

    // === WHITESPACE ===
    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
      let ws = '';
      while (i < code.length && (peek() === ' ' || peek() === '\t' || peek() === '\r' || peek() === '\n')) {
        ws += advance();
      }
      addToken('whitespace', ws, startLine, startCol);
      continue;
    }

    // === PREPROCESSOR DIRECTIVE ===
    if (ch === '#' && (startCol === 1 || tokens.length === 0 || tokens[tokens.length - 1].value.includes('\n'))) {
      let directive = '';
      while (i < code.length && peek() !== '\n') {
        directive += advance();
      }
      addToken('preprocessor', directive, startLine, startCol);
      continue;
    }

    // === SINGLE-LINE COMMENT ===
    if (ch === '/' && peek(1) === '/') {
      let comment = '';
      while (i < code.length && peek() !== '\n') {
        comment += advance();
      }
      addToken('comment', comment, startLine, startCol);
      continue;
    }

    // === MULTI-LINE COMMENT ===
    if (ch === '/' && peek(1) === '*') {
      let comment = advance() + advance(); // consume /*
      while (i < code.length && !(peek() === '*' && peek(1) === '/')) {
        comment += advance();
      }
      if (i < code.length) {
        comment += advance() + advance(); // consume */
      }
      addToken('comment', comment, startLine, startCol);
      continue;
    }

    // === STRING LITERAL ===
    if (ch === '"') {
      let str = advance(); // opening quote
      while (i < code.length && peek() !== '"') {
        if (peek() === '\\' && i + 1 < code.length) {
          str += advance(); // backslash
        }
        str += advance();
      }
      if (i < code.length) {
        str += advance(); // closing quote
      }
      addToken('string', str, startLine, startCol);
      continue;
    }

    // === CHARACTER LITERAL ===
    if (ch === "'") {
      let charLit = advance(); // opening quote
      while (i < code.length && peek() !== "'") {
        if (peek() === '\\' && i + 1 < code.length) {
          charLit += advance(); // backslash
        }
        charLit += advance();
      }
      if (i < code.length) {
        charLit += advance(); // closing quote
      }
      addToken('string', charLit, startLine, startCol);
      continue;
    }

    // === NUMBER ===
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(peek(1)))) {
      let num = '';
      // Hex prefix
      if (ch === '0' && (peek(1) === 'x' || peek(1) === 'X')) {
        num += advance() + advance();
        while (i < code.length && /[0-9a-fA-F]/.test(peek())) {
          num += advance();
        }
      } else {
        // Decimal/float
        while (i < code.length && /[0-9]/.test(peek())) {
          num += advance();
        }
        // Decimal point
        if (peek() === '.' && /[0-9]/.test(peek(1))) {
          num += advance();
          while (i < code.length && /[0-9]/.test(peek())) {
            num += advance();
          }
        }
        // Exponent
        if (peek() === 'e' || peek() === 'E') {
          num += advance();
          if (peek() === '+' || peek() === '-') {
            num += advance();
          }
          while (i < code.length && /[0-9]/.test(peek())) {
            num += advance();
          }
        }
      }
      // Suffix (f, F, l, L, u, U, ll, LL)
      while (i < code.length && /[fFlLuU]/.test(peek())) {
        num += advance();
      }
      addToken('number', num, startLine, startCol);
      continue;
    }

    // === IDENTIFIER / KEYWORD ===
    if (/[a-zA-Z_]/.test(ch)) {
      let ident = '';
      while (i < code.length && /[a-zA-Z0-9_]/.test(peek())) {
        ident += advance();
      }
      
      // Determine token type
      let type: TokenType;
      if (TYPE_KEYWORDS.has(ident)) {
        type = 'type';
      } else if (CONTROL_KEYWORDS.has(ident)) {
        type = 'keyword';
      } else if (STDLIB_FUNCTIONS.has(ident)) {
        type = 'stdlib';
      } else {
        // Check if followed by '(' to mark as function
        let lookAhead = i;
        while (lookAhead < code.length && (code[lookAhead] === ' ' || code[lookAhead] === '\t')) {
          lookAhead++;
        }
        if (code[lookAhead] === '(') {
          type = 'function';
        } else {
          type = 'identifier';
        }
      }
      
      addToken(type, ident, startLine, startCol);
      continue;
    }

    // === TWO-CHAR OPERATOR ===
    const twoChar = ch + peek(1);
    if (TWO_CHAR_OPERATORS.has(twoChar)) {
      advance();
      advance();
      addToken('operator', twoChar, startLine, startCol);
      continue;
    }

    // === SINGLE-CHAR OPERATOR ===
    if (SINGLE_CHAR_OPERATORS.has(ch)) {
      advance();
      addToken('operator', ch, startLine, startCol);
      continue;
    }

    // === UNKNOWN ===
    addToken('unknown', advance(), startLine, startCol);
  }

  return tokens;
}

// ============================================================================
// ONE DARK PRO COLOR MAPPING
// ============================================================================

const TOKEN_COLORS: Record<TokenType, { color: string; italic?: boolean; bold?: boolean }> = {
  preprocessor: { color: '#c678dd' },           // Purple
  type:         { color: '#e5c07b' },           // Yellow
  keyword:      { color: '#c678dd' },           // Purple
  stdlib:       { color: '#56b6c2' },           // Cyan
  function:     { color: '#61afef' },           // Blue
  identifier:   { color: '#e5e5e5' },           // Bright text
  number:       { color: '#d19a66' },           // Orange
  string:       { color: '#98c379' },           // Green
  operator:     { color: '#abb2bf' },           // Normal text
  comment:      { color: '#5c6370', italic: true }, // Gray italic
  whitespace:   { color: '' },                  // No styling
  unknown:      { color: '#e06c75' },           // Red (error)
};

// ============================================================================
// HTML RENDERER
// ============================================================================

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderToken(token: CodeToken): string {
  const escaped = escapeHtml(token.value);
  
  if (token.type === 'whitespace') {
    return escaped; // No span wrapper for whitespace
  }
  
  const style = TOKEN_COLORS[token.type];
  if (!style.color) {
    return escaped;
  }
  
  let styleStr = `color:${style.color}`;
  if (style.italic) styleStr += ';font-style:italic';
  if (style.bold) styleStr += ';font-weight:bold';
  
  return `<span style="${styleStr}">${escaped}</span>`;
}

// ============================================================================
// MAIN HIGHLIGHT FUNCTION
// ============================================================================

export default function highlight(code: string): string {
  if (!code) return '';
  
  const tokens = tokenize(code);
  const html = tokens.map(renderToken).join('');
  
  return html + '\n';
}
