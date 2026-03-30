/**
 * Simple C Interpreter for Visualization
 * 
 * Features:
 * - Variable declarations (int, float, char, arrays)
 * - Arithmetic operations
 * - Control flow (if/else, while, for)
 * - Function calls with call stack
 * - Basic pointer operations
 * 
 * Limitations:
 * - No preprocessor beyond simple #define
 * - Limited standard library (printf simulation)
 * - Simplified type system
 */

import { snapshotValue, MAX_TRACE_ARRAY_ALLOCATION_LENGTH } from './trace/runtime-snapshot.js';
import { normalizeTraceError } from './trace/trace-errors.js';
import { detectUnsupportedTraceFeature } from './trace/unsupported-syntax.js';

// ============================================================================
// TOKENIZER
// ============================================================================

const KEYWORDS = new Set([
  'int', 'float', 'double', 'char', 'void', 'return',
  'if', 'else', 'while', 'for', 'do', 'break', 'continue',
  'switch', 'case', 'default',
  'struct', 'sizeof', 'typedef', 'NULL', 'true', 'false'
]);

const TYPES = new Set(['int', 'float', 'double', 'char', 'void', 'long', 'short', 'unsigned']);
const MAX_TRACE_CALL_DEPTH = 256;

function tokenize(code) {
  const tokens = [];
  let i = 0;
  let line = 1;

  const peek = (n = 0) => code[i + n] || '';
  const advance = () => {
    const ch = code[i++];
    if (ch === '\n') { line++; }
    return ch;
  };

  while (i < code.length) {
    const ch = peek();
    const startLine = line;

    // Whitespace
    if (/\s/.test(ch)) { advance(); continue; }

    // Single-line comment
    if (ch === '/' && peek(1) === '/') {
      while (i < code.length && peek() !== '\n') advance();
      continue;
    }

    // Multi-line comment
    if (ch === '/' && peek(1) === '*') {
      advance(); advance();
      while (i < code.length && !(peek() === '*' && peek(1) === '/')) advance();
      advance(); advance();
      continue;
    }

    // Preprocessor
    if (ch === '#') {
      let val = '';
      while (i < code.length && peek() !== '\n') val += advance();
      tokens.push({ type: 'PREP', value: val.trim(), line: startLine });
      continue;
    }

    // String literal
    if (ch === '"') {
      let val = '';
      advance();
      while (i < code.length && peek() !== '"') {
        if (peek() === '\\') {
          advance();
          const esc = advance();
          val += esc === 'n' ? '\n' : esc === 't' ? '\t' : esc === '0' ? '\0' : esc;
        } else {
          val += advance();
        }
      }
      advance();
      tokens.push({ type: 'STRING', value: val, line: startLine });
      continue;
    }

    // Char literal
    if (ch === "'") {
      let val = '';
      advance();
      while (i < code.length && peek() !== "'") {
        if (peek() === '\\') { advance(); val += advance(); }
        else { val += advance(); }
      }
      advance();
      tokens.push({ type: 'NUM', value: val.charCodeAt(0) || 0, line: startLine });
      continue;
    }

    // Number
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(peek(1)))) {
      let val = '';
      if (ch === '0' && (peek(1) === 'x' || peek(1) === 'X')) {
        val += advance() + advance();
        while (/[0-9a-fA-F]/.test(peek())) val += advance();
        tokens.push({ type: 'NUM', value: parseInt(val, 16), line: startLine });
      } else {
        while (/[0-9.]/.test(peek())) val += advance();
        if (peek() === 'e' || peek() === 'E') {
          val += advance();
          if (peek() === '+' || peek() === '-') val += advance();
          while (/[0-9]/.test(peek())) val += advance();
        }
        while (/[fFlLuU]/.test(peek())) advance(); // suffix
        tokens.push({ type: 'NUM', value: parseFloat(val), line: startLine });
      }
      continue;
    }

    // Identifier / Keyword
    if (/[a-zA-Z_]/.test(ch)) {
      let val = '';
      while (/[a-zA-Z0-9_]/.test(peek())) val += advance();
      if (KEYWORDS.has(val)) {
        tokens.push({ type: 'KW', value: val, line: startLine });
      } else {
        tokens.push({ type: 'ID', value: val, line: startLine });
      }
      continue;
    }

    // Two-char operators
    const two = ch + peek(1);
    if (['==', '!=', '<=', '>=', '&&', '||', '++', '--', '+=', '-=', '*=', '/=', '%=', '<<', '>>', '->'].includes(two)) {
      advance(); advance();
      tokens.push({ type: 'OP', value: two, line: startLine });
      continue;
    }

    // Single-char operators
    if ('+-*/%<>=!&|^~?:;,.()[]{}#'.includes(ch)) {
      tokens.push({ type: 'OP', value: advance(), line: startLine });
      continue;
    }

    advance(); // skip unknown
  }

  tokens.push({ type: 'EOF', value: '', line });
  return tokens;
}

function evalConstExpr(expr, defines) {
  const substituted = expr.replace(/[A-Za-z_]\w*/g, (name) => {
    if (name in defines) {
      return String(defines[name]);
    }
    return name;
  });

  try {
    if (/^[\d\s+\-*/()%.]+$/.test(substituted)) {
      const result = Function(`"use strict"; return (${substituted});`)();
      if (typeof result === 'number' && Number.isFinite(result)) {
        return Math.trunc(result);
      }
    }
  } catch {
    // Fallback to integer parse below.
  }

  const num = Number.parseInt(expr, 10);
  return Number.isNaN(num) ? null : num;
}

function applyDefines(tokens) {
  const defines = {};

  for (const tok of tokens) {
    if (tok.type !== 'PREP') continue;

    const match = tok.value.match(/^#?\s*define\s+([A-Za-z_]\w*)\s+(.+)$/);
    if (!match) continue;

    const [, name, rawExpr] = match;
    const value = evalConstExpr(rawExpr.trim(), defines);
    if (value !== null) {
      defines[name] = value;
    }
  }

  return tokens.map((tok) => {
    if (tok.type === 'ID' && tok.value in defines) {
      return { ...tok, type: 'NUM', value: defines[tok.value] };
    }
    return tok;
  });
}

// ============================================================================
// PARSER
// ============================================================================

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
    this.typedefNames = new Set();
  }

  peek(n = 0) { return this.tokens[this.pos + n] || { type: 'EOF', value: '' }; }
  advance() { return this.tokens[this.pos++]; }
  expect(type, value) {
    const t = this.advance();
    if (t.type !== type || (value !== undefined && t.value !== value)) {
      throw new Error(`Expected ${type} ${value || ''}, got ${t.type} ${t.value} at line ${t.line}`);
    }
    return t;
  }
  match(type, value) {
    const t = this.peek();
    if (t.type === type && (value === undefined || t.value === value)) {
      return this.advance();
    }
    return null;
  }

  parseProgram() {
    const program = { type: 'Program', body: [], functions: {} };
    while (this.peek().type !== 'EOF') {
      if (this.peek().type === 'PREP') {
        program.body.push({ type: 'Preprocessor', value: this.advance().value });
      } else if (this.peek().type === 'KW' && this.peek().value === 'typedef') {
        program.body.push(this.parseTypedef());
      } else if (
        this.peek().type === 'KW' &&
        this.peek().value === 'struct' &&
        this.peek(1).type === 'ID' &&
        this.peek(2).value === '{'
      ) {
        program.body.push(this.parseStructDefinition());
      } else if (this.isTypeKeyword()) {
        const decl = this.parseDeclaration();
        if (decl.type === 'FunctionDef') {
          program.functions[decl.name] = decl;
        } else {
          program.body.push(decl);
        }
      } else {
        this.advance(); // skip unknown
      }
    }
    return program;
  }

  isTypeKeyword() {
    const t = this.peek();
    return (
      (t.type === 'KW' && (TYPES.has(t.value) || t.value === 'void' || t.value === 'struct')) ||
      (t.type === 'ID' && this.typedefNames.has(t.value))
    );
  }

  parseTypedef() {
    const line = this.peek().line;
    this.expect('KW', 'typedef');

    let alias = '';
    let depth = 0;
    while (this.peek().type !== 'EOF') {
      const token = this.advance();
      if (token.value === '{') {
        depth += 1;
      } else if (token.value === '}') {
        depth = Math.max(0, depth - 1);
      } else if (depth === 0 && token.type === 'ID') {
        alias = token.value;
      }

      if (depth === 0 && token.value === ';') {
        break;
      }
    }

    if (alias) {
      this.typedefNames.add(alias);
    }

    return { type: 'Typedef', name: alias, line };
  }

  parseDeclaration() {
    const line = this.peek().line;
    const baseType = this.parseType();
    let typeName = baseType;
    
    // Check for pointer
    while (this.match('OP', '*')) {
      typeName += '*';
    }

    const name = this.expect('ID').value;

    // Function definition
    if (this.match('OP', '(')) {
      const params = this.parseParams();
      this.expect('OP', ')');
      if (this.peek().value === '{') {
        const body = this.parseBlock();
        return { type: 'FunctionDef', name, returnType: typeName, params, body, line };
      } else {
        this.match('OP', ';');
        return { type: 'FunctionDecl', name, returnType: typeName, params, line };
      }
    }

    const declarations = [this.parseDeclaredBinding(typeName, name, line)];
    while (this.match('OP', ',')) {
      let declaratorType = baseType;
      while (this.match('OP', '*')) declaratorType += '*';
      const vname = this.expect('ID').value;
      declarations.push(this.parseDeclaredBinding(declaratorType, vname, line));
    }
    this.expect('OP', ';');

    if (declarations.length === 1) {
      return declarations[0];
    }

    return { type: 'DeclList', declarations, line };
  }

  parseDeclaredBinding(typeName, name, line) {
    const dimensions = [];
    while (this.match('OP', '[')) {
      const sizeExpr = this.peek().value !== ']' ? this.parseExpression() : null;
      this.expect('OP', ']');
      dimensions.push(sizeExpr);
    }

    if (dimensions.length > 0) {
      let init = null;
      if (this.match('OP', '=')) {
        init = this.parseInitializer();
      }
      return {
        type: 'ArrayDecl',
        varType: typeName,
        name,
        dimensions,
        sizeExpr: dimensions[0] ?? null,
        init,
        line
      };
    }

    let init = null;
    if (this.match('OP', '=')) {
      init = this.parseExpression();
    }

    return {
      type: 'VarDecl',
      varType: typeName,
      vars: [{ name, init }],
      line
    };
  }

  parseType() {
    let type = '';
    if (this.peek().type === 'KW' && this.peek().value === 'struct') {
      type = this.advance().value;
      if (this.peek().type === 'ID') {
        type += ` ${this.advance().value}`;
      }
      return type;
    }

    if (this.peek().type === 'ID' && this.typedefNames.has(this.peek().value)) {
      return this.advance().value;
    }

    while (this.peek().type === 'KW' && TYPES.has(this.peek().value)) {
      type += (type ? ' ' : '') + this.advance().value;
    }
    return type || 'int';
  }

  parseStructDefinition() {
    const line = this.peek().line;
    this.expect('KW', 'struct');
    const name = this.match('ID')?.value || '';
    this.expect('OP', '{');

    let depth = 1;
    while (depth > 0 && this.peek().type !== 'EOF') {
      if (this.peek().value === '{') depth += 1;
      else if (this.peek().value === '}') depth -= 1;
      this.advance();
    }

    this.match('OP', ';');
    return { type: 'StructDef', name, line };
  }

  parseParams() {
    const params = [];
    if (this.peek().value !== ')') {
      do {
        if (this.peek().value === 'void' && this.peek(1).value === ')') {
          this.advance();
          break;
        }
        let ptype = this.parseType();
        while (this.match('OP', '*')) ptype += '*';
        const pname = this.match('ID')?.value || '';

        while (this.match('OP', '[')) {
          if (this.peek().value !== ']') {
            this.parseExpression();
          }
          this.expect('OP', ']');
          ptype += '[]';
        }
        params.push({ type: ptype, name: pname });
      } while (this.match('OP', ','));
    }
    return params;
  }

  parseBlock() {
    const line = this.peek().line;
    this.expect('OP', '{');
    const statements = [];
    while (this.peek().value !== '}' && this.peek().type !== 'EOF') {
      statements.push(this.parseStatement());
    }
    this.expect('OP', '}');
    return { type: 'Block', statements, line };
  }

  parseStatement() {
    const t = this.peek();
    const line = t.line;

    if (t.value === '{') return this.parseBlock();
    if (t.value === 'if') return this.parseIf();
    if (t.value === 'while') return this.parseWhile();
    if (t.value === 'for') return this.parseFor();
    if (t.value === 'switch') return this.parseSwitch();
    if (t.value === 'return') return this.parseReturn();
    if (t.value === 'break') { this.advance(); this.match('OP', ';'); return { type: 'Break', line }; }
    if (t.value === 'continue') { this.advance(); this.match('OP', ';'); return { type: 'Continue', line }; }
    
    if (this.isTypeKeyword()) {
      return this.parseDeclaration();
    }

    // Expression statement
    const expr = this.parseExpression();
    this.match('OP', ';');
    return { type: 'ExprStmt', expr, line };
  }

  parseIf() {
    const line = this.peek().line;
    this.expect('KW', 'if');
    this.expect('OP', '(');
    const condition = this.parseExpression();
    this.expect('OP', ')');
    const consequent = this.parseStatement();
    let alternate = null;
    if (this.match('KW', 'else')) {
      alternate = this.parseStatement();
    }
    return { type: 'If', condition, consequent, alternate, line };
  }

  parseWhile() {
    const line = this.peek().line;
    this.expect('KW', 'while');
    this.expect('OP', '(');
    const condition = this.parseExpression();
    this.expect('OP', ')');
    const body = this.parseStatement();
    return { type: 'While', condition, body, line };
  }

  parseFor() {
    const line = this.peek().line;
    this.expect('KW', 'for');
    this.expect('OP', '(');
    
    let init = null;
    if (this.peek().value !== ';') {
      if (this.isTypeKeyword()) {
        init = this.parseDeclaration();
      } else {
        init = this.parseExpression();
        this.expect('OP', ';');
      }
    } else {
      this.advance();
    }

    let condition = null;
    if (this.peek().value !== ';') {
      condition = this.parseExpression();
    }
    this.expect('OP', ';');

    let update = null;
    if (this.peek().value !== ')') {
      update = this.parseExpression();
    }
    this.expect('OP', ')');

    const body = this.parseStatement();
    return { type: 'For', init, condition, update, body, line };
  }

  parseSwitch() {
    const line = this.peek().line;
    this.expect('KW', 'switch');
    this.expect('OP', '(');
    const discriminant = this.parseExpression();
    this.expect('OP', ')');
    this.expect('OP', '{');

    const clauses = [];

    while (this.peek().value !== '}' && this.peek().type !== 'EOF') {
      if (this.match('KW', 'case')) {
        const caseLine = this.tokens[this.pos - 1].line;
        const test = this.parseExpression();
        this.expect('OP', ':');

        const consequent = [];
        while (
          this.peek().type !== 'EOF' &&
          this.peek().value !== '}' &&
          !(this.peek().type === 'KW' && (this.peek().value === 'case' || this.peek().value === 'default'))
        ) {
          consequent.push(this.parseStatement());
        }

        clauses.push({ type: 'SwitchCase', test, consequent, line: caseLine });
        continue;
      }

      if (this.match('KW', 'default')) {
        const defaultLine = this.tokens[this.pos - 1].line;
        this.expect('OP', ':');

        const consequent = [];
        while (
          this.peek().type !== 'EOF' &&
          this.peek().value !== '}' &&
          !(this.peek().type === 'KW' && (this.peek().value === 'case' || this.peek().value === 'default'))
        ) {
          consequent.push(this.parseStatement());
        }

        clauses.push({ type: 'SwitchCase', test: null, consequent, line: defaultLine });
        continue;
      }

      // Recover from malformed switch bodies by consuming the unexpected token.
      this.advance();
    }

    this.expect('OP', '}');
    return { type: 'Switch', discriminant, clauses, line };
  }

  parseReturn() {
    const line = this.peek().line;
    this.expect('KW', 'return');
    let value = null;
    if (this.peek().value !== ';') {
      value = this.parseExpression();
    }
    this.expect('OP', ';');
    return { type: 'Return', value, line };
  }

  parseInitializer() {
    if (this.match('OP', '{')) {
      const elements = [];
      if (this.peek().value !== '}') {
        do {
          elements.push(this.parseInitializer());
        } while (this.match('OP', ','));
      }
      this.expect('OP', '}');
      return { type: 'ArrayInit', elements };
    }
    return this.parseExpression();
  }

  parseExpression() {
    return this.parseAssignment();
  }

  parseAssignment() {
    const left = this.parseLogicalOr();
    if (this.match('OP', '=') || this.match('OP', '+=') || this.match('OP', '-=') ||
        this.match('OP', '*=') || this.match('OP', '/=') || this.match('OP', '%=')) {
      const op = this.tokens[this.pos - 1].value;
      const right = this.parseAssignment();
      return { type: 'Assignment', left, op, right, line: left.line };
    }
    return left;
  }

  parseLogicalOr() {
    let left = this.parseLogicalAnd();
    while (this.match('OP', '||')) {
      const right = this.parseLogicalAnd();
      left = { type: 'Binary', op: '||', left, right, line: left.line };
    }
    return left;
  }

  parseLogicalAnd() {
    let left = this.parseEquality();
    while (this.match('OP', '&&')) {
      const right = this.parseEquality();
      left = { type: 'Binary', op: '&&', left, right, line: left.line };
    }
    return left;
  }

  parseEquality() {
    let left = this.parseRelational();
    while (this.match('OP', '==') || this.match('OP', '!=')) {
      const op = this.tokens[this.pos - 1].value;
      const right = this.parseRelational();
      left = { type: 'Binary', op, left, right, line: left.line };
    }
    return left;
  }

  parseRelational() {
    let left = this.parseAdditive();
    while (this.match('OP', '<') || this.match('OP', '>') ||
           this.match('OP', '<=') || this.match('OP', '>=')) {
      const op = this.tokens[this.pos - 1].value;
      const right = this.parseAdditive();
      left = { type: 'Binary', op, left, right, line: left.line };
    }
    return left;
  }

  parseAdditive() {
    let left = this.parseMultiplicative();
    while (this.match('OP', '+') || this.match('OP', '-')) {
      const op = this.tokens[this.pos - 1].value;
      const right = this.parseMultiplicative();
      left = { type: 'Binary', op, left, right, line: left.line };
    }
    return left;
  }

  parseMultiplicative() {
    let left = this.parseUnary();
    while (this.match('OP', '*') || this.match('OP', '/') || this.match('OP', '%')) {
      const op = this.tokens[this.pos - 1].value;
      const right = this.parseUnary();
      left = { type: 'Binary', op, left, right, line: left.line };
    }
    return left;
  }

  parseUnary() {
    const line = this.peek().line;
    if (this.match('OP', '!')) {
      return { type: 'Unary', op: '!', operand: this.parseUnary(), line };
    }
    if (this.match('OP', '-')) {
      return { type: 'Unary', op: '-', operand: this.parseUnary(), line };
    }
    if (this.match('OP', '++')) {
      return { type: 'Unary', op: '++pre', operand: this.parseUnary(), line };
    }
    if (this.match('OP', '--')) {
      return { type: 'Unary', op: '--pre', operand: this.parseUnary(), line };
    }
    if (this.match('OP', '&')) {
      return { type: 'Unary', op: '&', operand: this.parseUnary(), line };
    }
    if (this.match('OP', '*')) {
      return { type: 'Unary', op: '*', operand: this.parseUnary(), line };
    }
    return this.parsePostfix();
  }

  parsePostfix() {
    let expr = this.parsePrimary();
    while (true) {
      if (this.match('OP', '++')) {
        expr = { type: 'Unary', op: '++post', operand: expr, line: expr.line };
      } else if (this.match('OP', '--')) {
        expr = { type: 'Unary', op: '--post', operand: expr, line: expr.line };
      } else if (this.match('OP', '[')) {
        const index = this.parseExpression();
        this.expect('OP', ']');
        expr = { type: 'Index', object: expr, index, line: expr.line };
      } else if (this.match('OP', '(')) {
        // Function call
        const args = [];
        if (this.peek().value !== ')') {
          do {
            args.push(this.parseExpression());
          } while (this.match('OP', ','));
        }
        this.expect('OP', ')');
        expr = { type: 'Call', callee: expr, args, line: expr.line };
      } else if (this.match('OP', '.')) {
        const member = this.expect('ID').value;
        expr = { type: 'Member', object: expr, member, line: expr.line };
      } else if (this.match('OP', '->')) {
        const member = this.expect('ID').value;
        expr = { type: 'PtrMember', object: expr, member, line: expr.line };
      } else {
        break;
      }
    }
    return expr;
  }

  parsePrimary() {
    const t = this.peek();
    const line = t.line;

    if (this.peek().value === '(' && this.looksLikeCast()) {
      this.expect('OP', '(');
      let castType = this.parseType();
      while (this.match('OP', '*')) {
        castType += '*';
      }
      this.expect('OP', ')');
      return { type: 'Cast', castType, operand: this.parseUnary(), line };
    }

    if (t.type === 'NUM') {
      return { type: 'Number', value: this.advance().value, line };
    }
    if (t.type === 'STRING') {
      return { type: 'String', value: this.advance().value, line };
    }
    if (t.type === 'ID') {
      return { type: 'Identifier', name: this.advance().value, line };
    }
    if (t.value === 'NULL') {
      this.advance();
      return { type: 'Number', value: 0, line };
    }
    if (t.value === 'true') {
      this.advance();
      return { type: 'Number', value: 1, line };
    }
    if (t.value === 'false') {
      this.advance();
      return { type: 'Number', value: 0, line };
    }
    if (t.value === 'sizeof') {
      this.advance();
      this.expect('OP', '(');
      // Skip the type/expression inside sizeof
      let depth = 1;
      while (depth > 0 && this.peek().type !== 'EOF') {
        if (this.peek().value === '(') depth++;
        if (this.peek().value === ')') depth--;
        this.advance();
      }
      return { type: 'Number', value: 4, line }; // Simplified
    }
    if (this.match('OP', '(')) {
      const expr = this.parseExpression();
      this.expect('OP', ')');
      return expr;
    }

    this.advance();
    return { type: 'Number', value: 0, line };
  }

  looksLikeCast() {
    if (this.peek().value !== '(') {
      return false;
    }

    let cursor = this.pos + 1;
    const token = this.tokens[cursor];
    if (!token) {
      return false;
    }

    if (
      !(
        (token.type === 'KW' && (TYPES.has(token.value) || token.value === 'void' || token.value === 'struct')) ||
        (token.type === 'ID' && this.typedefNames.has(token.value))
      )
    ) {
      return false;
    }

    if (token.value === 'struct') {
      cursor += 1;
      if (this.tokens[cursor]?.type !== 'ID') {
        return false;
      }
    }

    cursor += 1;
    while (this.tokens[cursor]?.value === '*') {
      cursor += 1;
    }

    return this.tokens[cursor]?.value === ')';
  }
}

// ============================================================================
// INTERPRETER
// ============================================================================

class Interpreter {
  constructor(ast, maxSteps = 10000, input = '') {
    this.ast = ast;
    this.maxSteps = maxSteps;
    this.steps = [];
    this.stepCount = 0;
    
    // Memory model
    this.globalVars = {};
    this.callStack = []; // Array of { name, locals, returnAddr }
    this.heap = new Map(); // address -> value
    this.nextHeapAddr = 0x1000;
    
    this.output = '';
    this.breakFlag = false;
    this.continueFlag = false;
    this.returnValue = null;

    this.stdin = typeof input === 'string' ? input : '';
    this.stdinCursor = 0;
  }

  skipInputWhitespace() {
    while (this.stdinCursor < this.stdin.length && /\s/.test(this.stdin[this.stdinCursor])) {
      this.stdinCursor += 1;
    }
  }

  readInputToken() {
    this.skipInputWhitespace();
    if (this.stdinCursor >= this.stdin.length) {
      return null;
    }

    const start = this.stdinCursor;
    while (this.stdinCursor < this.stdin.length && !/\s/.test(this.stdin[this.stdinCursor])) {
      this.stdinCursor += 1;
    }
    return this.stdin.slice(start, this.stdinCursor);
  }

  readInputChar() {
    if (this.stdinCursor >= this.stdin.length) {
      return null;
    }
    const ch = this.stdin[this.stdinCursor];
    this.stdinCursor += 1;
    return ch;
  }

  readScanfValue(specifier) {
    const spec = specifier.toLowerCase();

    if (spec === 'c') {
      return this.readInputChar();
    }

    const token = this.readInputToken();
    if (token === null) {
      return null;
    }

    if (spec === 'd' || spec === 'i' || spec === 'u' || spec === 'o' || spec === 'x') {
      const parsed = Number.parseInt(token, spec === 'x' ? 16 : 10);
      return Number.isFinite(parsed) ? parsed : null;
    }

    if (spec === 'f' || spec === 'e' || spec === 'g' || spec === 'a') {
      const parsed = Number.parseFloat(token);
      return Number.isFinite(parsed) ? parsed : null;
    }

    if (spec === 's') {
      return token;
    }

    return token;
  }

  parseScanfSpecifiers(formatString) {
    const specs = [];
    for (let i = 0; i < formatString.length; i += 1) {
      if (formatString[i] !== '%') {
        continue;
      }

      const next = formatString[i + 1];
      if (next === '%') {
        i += 1;
        continue;
      }

      let cursor = i + 1;
      while (cursor < formatString.length && /[\d*\s]/.test(formatString[cursor])) {
        cursor += 1;
      }
      while (cursor < formatString.length && /[hlLzjt]/.test(formatString[cursor])) {
        cursor += 1;
      }

      if (cursor < formatString.length) {
        specs.push(formatString[cursor]);
        i = cursor;
      }
    }

    return specs;
  }

  assignScanfTarget(targetExpr, value) {
    const normalizedTarget =
      targetExpr?.type === 'Unary' && targetExpr.op === '&' ? targetExpr.operand : targetExpr;

    if (!normalizedTarget) {
      return false;
    }

    const reference = this.resolveLValue(normalizedTarget);
    if (reference) {
      reference.write(value);
      return true;
    }

    return false;
  }

  run() {
    try {
      // Execute global declarations first
      for (const node of this.ast.body) {
        if (node.type === 'VarDecl' || node.type === 'ArrayDecl' || node.type === 'DeclList') {
          this.execute(node);
        }
      }

      // Find and call main
      const main = this.ast.functions['main'];
      if (!main) {
        return { success: false, steps: [], errors: ['No main function found'] };
      }

      this.callStack.push({ name: 'main', locals: {}, returnAddr: -1 });
      this.executeBlock(main.body);
      this.callStack.pop();

      return {
        success: true,
        steps: this.steps,
        totalSteps: this.steps.length,
        errors: [],
        output: this.output
      };
    } catch (err) {
      return normalizeTraceError(err, {
        steps: this.steps,
        output: this.output,
        phase: 'runtime'
      });
    }
  }

  recordStep(lineNo, description = '') {
    if (this.stepCount++ > this.maxSteps) {
      throw new Error('Maximum steps exceeded (possible infinite loop)');
    }

    const globals = snapshotValue(this.globalVars);
    const frames = this.callStack.map((frame) => ({
      name: frame.name,
      locals: snapshotValue(frame.locals)
    }));

    // Keep a flattened memory map for existing consumers.
    const memory = { ...globals };
    for (const frame of frames) {
      for (const [k, v] of Object.entries(frame.locals)) {
        memory[`${frame.name}.${k}`] = snapshotValue(v);
      }
    }

    // Build registers showing call stack info
    const registers = {
      pc: lineNo,
      sp: 4096 - this.callStack.length * 64,
      fp: this.callStack.length > 0 ? 4096 - (this.callStack.length - 1) * 64 : 4096
    };

    const runtime = {
      globals,
      frames,
      flatMemory: memory,
      heap: snapshotValue(Object.fromEntries(this.heap))
    };

    // Preserve the older pseudo-global frame shape for compatibility.
    const stackFrames = [
      { name: 'global', locals: globals },
      ...frames
    ];

    this.steps.push({
      stepNumber: this.steps.length + 1,
      lineNo,
      description,
      registers,
      memory,
      stackFrames,
      runtime,
      instructionPointer: `line:${lineNo}`,
      timestamp: Date.now()
    });
  }

  getCurrentLocals() {
    if (this.callStack.length === 0) return this.globalVars;
    return this.callStack[this.callStack.length - 1].locals;
  }

  getVar(name) {
    // Check local scope first
    for (let i = this.callStack.length - 1; i >= 0; i--) {
      if (name in this.callStack[i].locals) {
        return this.callStack[i].locals[name];
      }
    }
    // Then global
    if (name in this.globalVars) {
      return this.globalVars[name];
    }
    return 0;
  }

  setVar(name, value) {
    // Check local scope first
    for (let i = this.callStack.length - 1; i >= 0; i--) {
      if (name in this.callStack[i].locals) {
        this.callStack[i].locals[name] = value;
        return;
      }
    }
    // Then global
    if (name in this.globalVars) {
      this.globalVars[name] = value;
      return;
    }
    // Create in current scope
    if (this.callStack.length > 0) {
      this.callStack[this.callStack.length - 1].locals[name] = value;
    } else {
      this.globalVars[name] = value;
    }
  }

  ensureHeapObject(address) {
    if (!address) {
      return null;
    }

    const existing = this.heap.get(address);
    if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
      return existing;
    }

    const created = {};
    this.heap.set(address, created);
    return created;
  }

  isTraceReference(value) {
    return Boolean(value) && typeof value === 'object' && value.__traceRef === true;
  }

  resolveVariableOwner(name) {
    for (let i = this.callStack.length - 1; i >= 0; i -= 1) {
      if (name in this.callStack[i].locals) {
        return this.callStack[i].locals;
      }
    }

    if (name in this.globalVars) {
      return this.globalVars;
    }

    return this.getCurrentLocals();
  }

  resolveLValue(node) {
    if (!node) return null;

    if (node.type === 'Identifier') {
      const owner = this.resolveVariableOwner(node.name);
      return {
        read: () => owner[node.name] ?? 0,
        write: (value) => {
          owner[node.name] = value;
        }
      };
    }

    if (node.type === 'Index') {
      let container = this.evaluate(node.object);
      const idx = this.evaluate(node.index);
      if (!Number.isInteger(idx) || idx < 0) {
        return null;
      }

      if (!(Array.isArray(container) || (container && typeof container === 'object'))) {
        const ownerReference = this.resolveLValue(node.object);
        if (ownerReference) {
          const created = [];
          ownerReference.write(created);
          container = created;
        }
      }

      if (Array.isArray(container)) {
        return {
          read: () => container[idx] ?? 0,
          write: (value) => {
            container[idx] = value;
          }
        };
      }

      if (container && typeof container === 'object') {
        return {
          read: () => container[idx] ?? 0,
          write: (value) => {
            container[idx] = value;
          }
        };
      }

      return null;
    }

    if (node.type === 'Member' || node.type === 'PtrMember') {
      const container = this.resolveMemberContainer(node);
      if (!container) {
        return null;
      }

      return {
        read: () => container[node.member] ?? 0,
        write: (value) => {
          container[node.member] = value;
        }
      };
    }

    return null;
  }

  resolveMemberContainer(target) {
    if (!target) return null;

    if (target.type === 'PtrMember') {
      const pointer = this.evaluate(target.object);
      if (this.isTraceReference(pointer)) {
        const reference = pointer.reference;
        if (!reference) {
          return null;
        }

        const current = reference.read();
        if (current && typeof current === 'object' && !Array.isArray(current)) {
          return current;
        }

        const created = {};
        reference.write(created);
        return created;
      }

      if (pointer && typeof pointer === 'object' && !Array.isArray(pointer)) {
        return pointer;
      }

      return this.ensureHeapObject(pointer);
    }

    if (target.type === 'Member') {
      const reference = this.resolveLValue(target.object);
      if (reference) {
        const current = reference.read();
        if (current && typeof current === 'object' && !Array.isArray(current)) {
          return current;
        }

        const created = {};
        reference.write(created);
        return created;
      }

      const value = this.evaluate(target.object);
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value;
      }
    }

    return null;
  }

  execute(node) {
    if (!node) return undefined;

    switch (node.type) {
      case 'VarDecl': {
        this.executeVarDecl(node);
        return;
      }

      case 'ArrayDecl': {
        this.executeArrayDecl(node);
        return;
      }

      case 'DeclList': {
        this.recordStep(node.line, `Variable declaration`);
        for (const declaration of node.declarations) {
          if (declaration.type === 'VarDecl') {
            this.executeVarDecl(declaration, false);
          } else if (declaration.type === 'ArrayDecl') {
            this.executeArrayDecl(declaration, false);
          }
        }
        return;
      }

      case 'Block': {
        this.executeBlock(node);
        return;
      }

      case 'If': {
        this.recordStep(node.line, `if condition`);
        const cond = this.evaluate(node.condition);
        if (cond) {
          this.execute(node.consequent);
        } else if (node.alternate) {
          this.execute(node.alternate);
        }
        return;
      }

      case 'While': {
        while (true) {
          this.recordStep(node.line, `while condition`);
          if (!this.evaluate(node.condition)) break;
          this.execute(node.body);
          if (this.breakFlag) { this.breakFlag = false; break; }
          if (this.continueFlag) { this.continueFlag = false; continue; }
          if (this.returnValue !== null) break;
        }
        return;
      }

      case 'For': {
        if (node.init) {
          if (node.init.type === 'VarDecl' || node.init.type === 'ArrayDecl' || node.init.type === 'DeclList' || node.init.type === 'ExprStmt') {
            this.execute(node.init);
          } else {
            this.evaluate(node.init);
          }
        }
        while (true) {
          if (node.condition) {
            this.recordStep(node.condition.line || node.line, `for condition`);
            if (!this.evaluate(node.condition)) break;
          }
          this.execute(node.body);
          if (this.breakFlag) { this.breakFlag = false; break; }
          if (this.continueFlag) { this.continueFlag = false; }
          if (this.returnValue !== null) break;
          if (node.update) {
            this.evaluate(node.update);
          }
        }
        return;
      }

      case 'Switch': {
        this.recordStep(node.line, `switch condition`);
        const discriminant = this.evaluate(node.discriminant);

        let startIndex = -1;
        for (let i = 0; i < node.clauses.length; i += 1) {
          const switchCase = node.clauses[i];
          if (switchCase.test === null) {
            if (startIndex === -1) {
              startIndex = i;
            }
            continue;
          }

          if (this.evaluate(switchCase.test) === discriminant) {
            startIndex = i;
            break;
          }
        }

        if (startIndex === -1) {
          return;
        }

        for (let i = startIndex; i < node.clauses.length; i += 1) {
          const switchCase = node.clauses[i];
          this.recordStep(switchCase.line, switchCase.test === null ? 'default case' : 'case match');

          for (const stmt of switchCase.consequent) {
            this.execute(stmt);
            if (this.breakFlag || this.continueFlag || this.returnValue !== null) {
              break;
            }
          }

          if (this.breakFlag) {
            this.breakFlag = false;
            break;
          }

          if (this.continueFlag || this.returnValue !== null) {
            break;
          }
        }
        return;
      }

      case 'Return': {
        this.recordStep(node.line, `return`);
        this.returnValue = node.value ? this.evaluate(node.value) : 0;
        return;
      }

      case 'Break': {
        this.breakFlag = true;
        return;
      }

      case 'Continue': {
        this.continueFlag = true;
        return;
      }

      case 'ExprStmt': {
        this.recordStep(node.line, `expression`);
        this.evaluate(node.expr);
        return;
      }

      default:
        return;
    }
  }

  executeBlock(block) {
    for (const stmt of block.statements) {
      this.execute(stmt);
      if (this.breakFlag || this.continueFlag || this.returnValue !== null) {
        break;
      }
    }
  }

  executeVarDecl(node, shouldRecord = true) {
    if (shouldRecord) {
      this.recordStep(node.line, `Variable declaration`);
    }

    for (const v of node.vars) {
      const val = v.init ? this.evaluate(v.init) : 0;
      this.setVar(v.name, val);
    }
  }

  resolveArrayDimensions(node) {
    const rawDimensions =
      Array.isArray(node.dimensions) && node.dimensions.length > 0
        ? node.dimensions
        : [node.sizeExpr ?? null];

    return rawDimensions.map((expr, index) => {
      if (expr) {
        return Math.max(0, Math.trunc(this.evaluate(expr)));
      }

      if (index === 0 && node.init?.elements) {
        return node.init.elements.length;
      }

      return 0;
    });
  }

  countArraySlots(dimensions) {
    if (!Array.isArray(dimensions) || dimensions.length === 0) {
      return 0;
    }

    return dimensions.reduce((total, size) => total * Math.max(0, size), 1);
  }

  createNestedArray(dimensions, depth = 0) {
    const size = dimensions[depth] ?? 0;
    const arr = new Array(size).fill(0);

    if (depth < dimensions.length - 1) {
      for (let i = 0; i < size; i += 1) {
        arr[i] = this.createNestedArray(dimensions, depth + 1);
      }
    }

    return arr;
  }

  applyArrayInitializer(target, initNode) {
    if (!Array.isArray(target) || !initNode?.elements) {
      return;
    }

    for (let i = 0; i < initNode.elements.length && i < target.length; i += 1) {
      const element = initNode.elements[i];
      if (element?.type === 'ArrayInit' && Array.isArray(target[i])) {
        this.applyArrayInitializer(target[i], element);
        continue;
      }

      if (Array.isArray(target[i])) {
        continue;
      }

      target[i] = this.evaluate(element);
    }
  }

  executeArrayDecl(node, shouldRecord = true) {
    if (shouldRecord) {
      this.recordStep(node.line, `Array declaration: ${node.name}`);
    }

    const dimensions = this.resolveArrayDimensions(node);
    const totalSize = this.countArraySlots(dimensions);
    if (totalSize > MAX_TRACE_ARRAY_ALLOCATION_LENGTH) {
      throw new Error(
        `Trace array limit exceeded (${totalSize}). The trace engine supports arrays up to ${MAX_TRACE_ARRAY_ALLOCATION_LENGTH} elements. Use compile/run for larger inputs.`
      );
    }

    const arr =
      dimensions.length > 1
        ? this.createNestedArray(dimensions)
        : new Array(dimensions[0] || 0).fill(0);

    if (node.init?.elements) {
      this.applyArrayInitializer(arr, node.init);
    }

    this.setVar(node.name, arr);
  }

  evaluate(node) {
    if (!node) return 0;

    switch (node.type) {
      case 'Number':
        return node.value;

      case 'String':
        return node.value;

      case 'Identifier':
        return this.getVar(node.name);

      case 'Binary': {
        const left = this.evaluate(node.left);
        switch (node.op) {
          case '&&':
            return left ? (this.evaluate(node.right) ? 1 : 0) : 0;
          case '||':
            return left ? 1 : (this.evaluate(node.right) ? 1 : 0);
          default: {
            const right = this.evaluate(node.right);
            switch (node.op) {
              case '+': return left + right;
              case '-': return left - right;
              case '*': return left * right;
              case '/': return right === 0 ? 0 : Math.trunc(left / right);
              case '%': return right === 0 ? 0 : left % right;
              case '<': return left < right ? 1 : 0;
              case '>': return left > right ? 1 : 0;
              case '<=': return left <= right ? 1 : 0;
              case '>=': return left >= right ? 1 : 0;
              case '==': return left === right ? 1 : 0;
              case '!=': return left !== right ? 1 : 0;
              default: return 0;
            }
          }
        }
      }

      case 'Unary': {
        if (node.op === '++pre' || node.op === '--pre') {
          const reference = this.resolveLValue(node.operand);
          if (!reference) return 0;
          const current = reference.read();
          const val = current + (node.op === '++pre' ? 1 : -1);
          reference.write(val);
          return val;
        }
        if (node.op === '++post' || node.op === '--post') {
          const reference = this.resolveLValue(node.operand);
          if (!reference) return 0;
          const val = reference.read();
          reference.write(val + (node.op === '++post' ? 1 : -1));
          return val;
        }
        const operand = this.evaluate(node.operand);
        switch (node.op) {
          case '-': return -operand;
          case '!': return operand ? 0 : 1;
          case '&':
            if (
              node.operand?.type === 'Identifier' ||
              node.operand?.type === 'Index' ||
              node.operand?.type === 'Member' ||
              node.operand?.type === 'PtrMember'
            ) {
              const reference = this.resolveLValue(node.operand);
              if (reference) {
                return { __traceRef: true, reference };
              }
            }
            return this.nextHeapAddr++;
          case '*':
            if (this.isTraceReference(operand)) {
              return operand.reference?.read() ?? 0;
            }
            return this.heap.get(operand) || 0; // Simplified dereference
          default: return operand;
        }
      }

      case 'Cast':
        return this.evaluate(node.operand);

      case 'Assignment': {
        const right = this.evaluate(node.right);
        const reference = this.resolveLValue(node.left);
        if (reference) {
          let val = right;
          if (node.op !== '=') {
            const left = reference.read();
            switch (node.op) {
              case '+=': val = left + right; break;
              case '-=': val = left - right; break;
              case '*=': val = left * right; break;
              case '/=': val = right === 0 ? left : Math.trunc(left / right); break;
              case '%=': val = right === 0 ? left : left % right; break;
            }
          }
          reference.write(val);
          return val;
        }
        return right;
      }

      case 'Index': {
        const arr = this.evaluate(node.object);
        const idx = this.evaluate(node.index);
        if (Array.isArray(arr)) {
          return arr[idx] ?? 0;
        }
        if (arr && typeof arr === 'object') {
          return arr[idx] ?? 0;
        }
        return 0;
      }

      case 'Member': {
        const container = this.resolveMemberContainer(node);
        return container ? (container[node.member] ?? 0) : 0;
      }

      case 'PtrMember': {
        const container = this.resolveMemberContainer(node);
        return container ? (container[node.member] ?? 0) : 0;
      }

      case 'Call': {
        const funcName = node.callee.name;
        
        // Built-in functions
        if (funcName === 'malloc' || funcName === 'calloc') {
          const address = this.nextHeapAddr;
          this.nextHeapAddr += 8;
          this.heap.set(address, {});
          return address;
        }

        if (funcName === 'free') {
          const address = node.args[0] ? this.evaluate(node.args[0]) : 0;
          if (address) {
            this.heap.delete(address);
          }
          return 0;
        }

        if (funcName === 'printf') {
          const fmt = node.args[0] ? this.evaluate(node.args[0]) : '';
          const args = node.args.slice(1).map(a => this.evaluate(a));
          let output = String(fmt);
          let argIdx = 0;
          output = output.replace(/%[difsc%]/g, (spec) => {
            if (spec === '%%') return '%';
            const value = args[argIdx++];
            if (spec === '%c') {
              return typeof value === 'number' ? String.fromCharCode(value) : String(value ?? '');
            }
            return value ?? '';
          });
          this.output += output;
          return output.length;
        }

        if (funcName === 'puts') {
          const text = node.args[0] ? this.evaluate(node.args[0]) : '';
          this.output += `${String(text)}\n`;
          return 0;
        }
        
        if (funcName === 'scanf') {
          const format = String(node.args[0] ? this.evaluate(node.args[0]) : '');
          const specs = this.parseScanfSpecifiers(format);
          let assigned = 0;
          let argIndex = 1;

          for (const spec of specs) {
            if (argIndex >= node.args.length) break;
            const readValue = this.readScanfValue(spec);
            if (readValue === null) {
              break;
            }

            if (this.assignScanfTarget(node.args[argIndex], readValue)) {
              assigned += 1;
            }
            argIndex += 1;
          }

          return assigned;
        }

        // User-defined function
        const func = this.ast.functions[funcName];
        if (!func) return 0;
        if (this.callStack.length >= MAX_TRACE_CALL_DEPTH) {
          throw new Error(`Trace call-depth limit exceeded at ${funcName}`);
        }

        // Create new stack frame
        const frame = { name: funcName, locals: {}, returnAddr: node.line };
        
        // Bind parameters
        for (let i = 0; i < func.params.length; i++) {
          const param = func.params[i];
          if (!param.name) continue;
          const argVal = i < node.args.length ? this.evaluate(node.args[i]) : 0;
          frame.locals[param.name] = argVal;
        }

        this.callStack.push(frame);
        this.recordStep(func.line, `Call ${funcName}`);
        
        this.returnValue = null;
        this.executeBlock(func.body);
        
        const ret = this.returnValue ?? 0;
        this.returnValue = null;
        this.callStack.pop();
        
        return ret;
      }

      default:
        return 0;
    }
  }
}

// ============================================================================
// MAIN EXPORT
// ============================================================================

export async function traceExecution(code, breakpoints = [], input = '') {
  try {
    const unsupportedFeatureResult = detectUnsupportedTraceFeature(code);
    if (unsupportedFeatureResult) {
      return unsupportedFeatureResult;
    }

    const rawTokens = tokenize(code);
    const tokens = applyDefines(rawTokens);
    const parser = new Parser(tokens);
    const ast = parser.parseProgram();
    const interpreter = new Interpreter(ast, 10000, input);
    const result = interpreter.run();

    if (!result.success) {
      return result;
    }

    const maxLine = typeof code === 'string' ? code.split(/\r?\n/).length : 0;
    const validBreakpoints = Array.isArray(breakpoints)
      ? [...new Set(breakpoints.filter((lineNo) => Number.isInteger(lineNo) && lineNo > 0 && lineNo <= maxLine))]
      : [];

    if (validBreakpoints.length === 0) {
      return result;
    }

    const breakpointSet = new Set(validBreakpoints);
    const filteredSteps = result.steps.filter((step) => breakpointSet.has(step.lineNo));

    return {
      ...result,
      steps: filteredSteps,
      totalSteps: filteredSteps.length
    };
  } catch (err) {
    return normalizeTraceError(err, { steps: [], phase: 'trace' });
  }
}
