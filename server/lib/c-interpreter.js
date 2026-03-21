/**
 * Simple C Interpreter for Visualization
 * Fixed: #define substitution, array size with identifiers/expressions,
 *        global array mutation in function calls.
 */

// ============================================================================
// TOKENIZER
// ============================================================================
const KEYWORDS = new Set([
  'int', 'float', 'double', 'char', 'void', 'return',
  'if', 'else', 'while', 'for', 'do', 'break', 'continue',
  'struct', 'sizeof', 'NULL', 'true', 'false'
]);
const TYPES = new Set(['int', 'float', 'double', 'char', 'void', 'long', 'short', 'unsigned']);

function tokenize(code) {
  const tokens = [];
  let i = 0;
  let line = 1;
  const peek = (n = 0) => code[i + n] || '';
  const advance = () => { const ch = code[i++]; if (ch === '\n') line++; return ch; };

  while (i < code.length) {
    const ch = peek();
    const startLine = line;
    if (/\s/.test(ch)) { advance(); continue; }
    if (ch === '/' && peek(1) === '/') { while (i < code.length && peek() !== '\n') advance(); continue; }
    if (ch === '/' && peek(1) === '*') {
      advance(); advance();
      while (i < code.length && !(peek() === '*' && peek(1) === '/')) advance();
      advance(); advance(); continue;
    }
    if (ch === '#') {
      let val = '';
      while (i < code.length && peek() !== '\n') val += advance();
      tokens.push({ type: 'PREP', value: val.trim(), line: startLine });
      continue;
    }
    if (ch === '"') {
      let val = ''; advance();
      while (i < code.length && peek() !== '"') {
        if (peek() === '\\') { advance(); const esc = advance(); val += esc === 'n' ? '\n' : esc === 't' ? '\t' : esc === '0' ? '\0' : esc; }
        else val += advance();
      }
      advance();
      tokens.push({ type: 'STRING', value: val, line: startLine }); continue;
    }
    if (ch === "'") {
      let val = ''; advance();
      while (i < code.length && peek() !== "'") { if (peek() === '\\') { advance(); val += advance(); } else val += advance(); }
      advance();
      tokens.push({ type: 'NUM', value: val.charCodeAt(0) || 0, line: startLine }); continue;
    }
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(peek(1)))) {
      let val = '';
      if (ch === '0' && (peek(1) === 'x' || peek(1) === 'X')) {
        val += advance() + advance();
        while (/[0-9a-fA-F]/.test(peek())) val += advance();
        tokens.push({ type: 'NUM', value: parseInt(val, 16), line: startLine });
      } else {
        while (/[0-9.]/.test(peek())) val += advance();
        if (peek() === 'e' || peek() === 'E') { val += advance(); if (peek() === '+' || peek() === '-') val += advance(); while (/[0-9]/.test(peek())) val += advance(); }
        while (/[fFlLuU]/.test(peek())) advance();
        tokens.push({ type: 'NUM', value: parseFloat(val), line: startLine });
      }
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let val = '';
      while (/[a-zA-Z0-9_]/.test(peek())) val += advance();
      tokens.push({ type: KEYWORDS.has(val) ? 'KW' : 'ID', value: val, line: startLine }); continue;
    }
    const two = ch + peek(1);
    if (['==','!=','<=','>=','&&','||','++','--','+=','-=','*=','/=','%=','<<','>>','->'].includes(two)) {
      advance(); advance(); tokens.push({ type: 'OP', value: two, line: startLine }); continue;
    }
    if ('+-*/%<>=!&|^~?:;,.()[]{}#'.includes(ch)) {
      tokens.push({ type: 'OP', value: advance(), line: startLine }); continue;
    }
    advance();
  }
  tokens.push({ type: 'EOF', value: '', line });
  return tokens;
}

// ============================================================================
// FIX 1: #define substitution pass
// Scan PREP tokens for "#define NAME VALUE", build a map, then replace all
// matching ID tokens with NUM tokens before the parser runs.
// ============================================================================
function applyDefines(tokens) {
  const defines = {};

  // First pass: collect all #define macros
  for (const tok of tokens) {
    if (tok.type === 'PREP') {
      // e.g. "define MAX 5"  or  "#define MAX 5"
      const m = tok.value.match(/^#?\s*define\s+([A-Za-z_]\w*)\s+(.+)$/);
      if (m) {
        const name = m[1];
        const rawVal = m[2].trim();
        // Parse the value: number, or a simple arithmetic expression of numbers
        const numVal = evalConstExpr(rawVal, defines);
        if (numVal !== null) defines[name] = numVal;
      }
    }
  }

  // Second pass: replace ID tokens that match defines with NUM tokens
  return tokens.map(tok => {
    if (tok.type === 'ID' && tok.value in defines) {
      return { ...tok, type: 'NUM', value: defines[tok.value] };
    }
    return tok;
  });
}

// Evaluate a simple constant expression (for #define values like "MAX - 1")
// Returns a number or null if it can't be resolved.
function evalConstExpr(expr, defines) {
  // Substitute known defines into the expression string
  let substituted = expr.replace(/[A-Za-z_]\w*/g, name => {
    if (name in defines) return String(defines[name]);
    return name; // leave unknown identifiers — eval will fail safely
  });
  try {
    // Only allow safe numeric expressions
    if (/^[\d\s+\-*/()%.]+$/.test(substituted)) {
      const result = Function('"use strict"; return (' + substituted + ')')();
      if (typeof result === 'number' && isFinite(result)) return Math.trunc(result);
    }
  } catch {
    // Ignore and fall through to plain integer parsing.
  }
  // Plain integer fallback
  const n = parseInt(expr, 10);
  return isNaN(n) ? null : n;
}

// ============================================================================
// PARSER
// ============================================================================
class Parser {
  constructor(tokens) { this.tokens = tokens; this.pos = 0; }
  peek(n = 0) { return this.tokens[this.pos + n] || { type: 'EOF', value: '' }; }
  advance() { return this.tokens[this.pos++]; }
  expect(type, value) {
    const t = this.advance();
    if (t.type !== type || (value !== undefined && t.value !== value))
      throw new Error(`Expected ${type} '${value || ''}', got ${t.type} '${t.value}' at line ${t.line}`);
    return t;
  }
  match(type, value) {
    const t = this.peek();
    if (t.type === type && (value === undefined || t.value === value)) return this.advance();
    return null;
  }
  parseProgram() {
    const program = { type: 'Program', body: [], functions: {} };
    while (this.peek().type !== 'EOF') {
      if (this.peek().type === 'PREP') { this.advance(); continue; } // already applied
      if (this.isTypeKeyword()) {
        const decl = this.parseDeclaration();
        if (decl.type === 'FunctionDef') program.functions[decl.name] = decl;
        else program.body.push(decl);
      } else { this.advance(); }
    }
    return program;
  }
  isTypeKeyword() {
    const t = this.peek();
    return TYPES.has(t.value) || t.value === 'void' || t.value === 'struct';
  }
  parseDeclaration() {
    const line = this.peek().line;
    let typeName = this.parseType();
    while (this.match('OP', '*')) typeName += '*';
    const name = this.expect('ID').value;
    if (this.match('OP', '(')) {
      const params = this.parseParams();
      this.expect('OP', ')');
      if (this.peek().value === '{') {
        const body = this.parseBlock();
        return { type: 'FunctionDef', name, returnType: typeName, params, body, line };
      }
      this.match('OP', ';');
      return { type: 'FunctionDecl', name, returnType: typeName, params, line };
    }
    // FIX 2: Array size can now be a full constant expression, not just a literal
    if (this.match('OP', '[')) {
      const sizeExpr = this.peek().value !== ']' ? this.parseExpression() : null;
      this.expect('OP', ']');
      let init = null;
      if (this.match('OP', '=')) init = this.parseInitializer();
      this.match('OP', ';');
      return { type: 'ArrayDecl', varType: typeName, name, sizeExpr, init, line };
    }
    let init = null;
    if (this.match('OP', '=')) init = this.parseExpression();
    const vars = [{ name, init }];
    while (this.match('OP', ',')) {
      while (this.match('OP', '*')) typeName += '*';
      const vname = this.expect('ID').value;
      let vinit = null;
      if (this.match('OP', '=')) vinit = this.parseExpression();
      vars.push({ name: vname, init: vinit });
    }
    this.match('OP', ';');
    return { type: 'VarDecl', varType: typeName, vars, line };
  }
  parseType() {
    let type = '';
    while (this.peek().type === 'KW' && TYPES.has(this.peek().value))
      type += (type ? ' ' : '') + this.advance().value;
    return type || 'int';
  }
  parseParams() {
    const params = [];
    if (this.peek().value !== ')') {
      do {
        if (this.peek().value === 'void' && this.peek(1).value === ')') { this.advance(); break; }
        let ptype = this.parseType();
        while (this.match('OP', '*')) ptype += '*';
        const pname = this.match('ID')?.value || '';
        if (this.match('OP', '[')) { this.match('OP', ']'); ptype += '[]'; }
        params.push({ type: ptype, name: pname });
      } while (this.match('OP', ','));
    }
    return params;
  }
  parseBlock() {
    const line = this.peek().line;
    this.expect('OP', '{');
    const statements = [];
    while (this.peek().value !== '}' && this.peek().type !== 'EOF')
      statements.push(this.parseStatement());
    this.expect('OP', '}');
    return { type: 'Block', statements, line };
  }
  parseStatement() {
    const t = this.peek(); const line = t.line;
    if (t.value === '{') return this.parseBlock();
    if (t.value === 'if') return this.parseIf();
    if (t.value === 'while') return this.parseWhile();
    if (t.value === 'for') return this.parseFor();
    if (t.value === 'return') return this.parseReturn();
    if (t.value === 'break') { this.advance(); this.match('OP', ';'); return { type: 'Break', line }; }
    if (t.value === 'continue') { this.advance(); this.match('OP', ';'); return { type: 'Continue', line }; }
    if (this.isTypeKeyword()) return this.parseDeclaration();
    const expr = this.parseExpression();
    this.match('OP', ';');
    return { type: 'ExprStmt', expr, line };
  }
  parseIf() {
    const line = this.peek().line; this.expect('KW', 'if'); this.expect('OP', '(');
    const condition = this.parseExpression(); this.expect('OP', ')');
    const consequent = this.parseStatement();
    let alternate = null;
    if (this.match('KW', 'else')) alternate = this.parseStatement();
    return { type: 'If', condition, consequent, alternate, line };
  }
  parseWhile() {
    const line = this.peek().line; this.expect('KW', 'while'); this.expect('OP', '(');
    const condition = this.parseExpression(); this.expect('OP', ')');
    return { type: 'While', condition, body: this.parseStatement(), line };
  }
  parseFor() {
    const line = this.peek().line; this.expect('KW', 'for'); this.expect('OP', '(');
    let init = null;
    if (this.peek().value !== ';') {
      if (this.isTypeKeyword()) init = this.parseDeclaration();
      else { init = this.parseExpression(); this.expect('OP', ';'); }
    } else this.advance();
    let condition = null;
    if (this.peek().value !== ';') condition = this.parseExpression();
    this.expect('OP', ';');
    let update = null;
    if (this.peek().value !== ')') update = this.parseExpression();
    this.expect('OP', ')');
    return { type: 'For', init, condition, update, body: this.parseStatement(), line };
  }
  parseReturn() {
    const line = this.peek().line; this.advance();
    let value = null;
    if (this.peek().value !== ';') value = this.parseExpression();
    this.match('OP', ';');
    return { type: 'Return', value, line };
  }
  parseInitializer() {
    if (this.match('OP', '{')) {
      const elements = [];
      if (this.peek().value !== '}') {
        do { elements.push(this.parseExpression()); } while (this.match('OP', ','));
      }
      this.expect('OP', '}');
      return { type: 'ArrayInit', elements };
    }
    return this.parseExpression();
  }
  parseExpression() { return this.parseAssignment(); }
  parseAssignment() {
    const left = this.parseLogicalOr();
    if (['=','+=','-=','*=','/=','%='].includes(this.peek().value) && this.peek().type === 'OP') {
      const op = this.advance().value;
      return { type: 'Assignment', left, op, right: this.parseAssignment(), line: left.line };
    }
    return left;
  }
  parseLogicalOr() {
    let left = this.parseLogicalAnd();
    while (this.match('OP', '||')) left = { type: 'Binary', op: '||', left, right: this.parseLogicalAnd(), line: left.line };
    return left;
  }
  parseLogicalAnd() {
    let left = this.parseEquality();
    while (this.match('OP', '&&')) left = { type: 'Binary', op: '&&', left, right: this.parseEquality(), line: left.line };
    return left;
  }
  parseEquality() {
    let left = this.parseRelational();
    while (this.peek().type === 'OP' && ['==','!='].includes(this.peek().value)) {
      const op = this.advance().value; left = { type: 'Binary', op, left, right: this.parseRelational(), line: left.line };
    }
    return left;
  }
  parseRelational() {
    let left = this.parseAdditive();
    while (this.peek().type === 'OP' && ['<','>','<=','>='].includes(this.peek().value)) {
      const op = this.advance().value; left = { type: 'Binary', op, left, right: this.parseAdditive(), line: left.line };
    }
    return left;
  }
  parseAdditive() {
    let left = this.parseMultiplicative();
    while (this.peek().type === 'OP' && ['+','-'].includes(this.peek().value)) {
      const op = this.advance().value; left = { type: 'Binary', op, left, right: this.parseMultiplicative(), line: left.line };
    }
    return left;
  }
  parseMultiplicative() {
    let left = this.parseUnary();
    while (this.peek().type === 'OP' && ['*','/','%'].includes(this.peek().value)) {
      const op = this.advance().value; left = { type: 'Binary', op, left, right: this.parseUnary(), line: left.line };
    }
    return left;
  }
  parseUnary() {
    const line = this.peek().line;
    if (this.match('OP', '!')) return { type: 'Unary', op: '!', operand: this.parseUnary(), line };
    if (this.match('OP', '-')) return { type: 'Unary', op: '-', operand: this.parseUnary(), line };
    if (this.match('OP', '++')) return { type: 'Unary', op: '++pre', operand: this.parseUnary(), line };
    if (this.match('OP', '--')) return { type: 'Unary', op: '--pre', operand: this.parseUnary(), line };
    if (this.match('OP', '&')) return { type: 'Unary', op: '&', operand: this.parseUnary(), line };
    if (this.match('OP', '*')) return { type: 'Unary', op: '*', operand: this.parseUnary(), line };
    return this.parsePostfix();
  }
  parsePostfix() {
    let expr = this.parsePrimary();
    while (true) {
      if (this.match('OP', '++')) expr = { type: 'Unary', op: '++post', operand: expr, line: expr.line };
      else if (this.match('OP', '--')) expr = { type: 'Unary', op: '--post', operand: expr, line: expr.line };
      else if (this.match('OP', '[')) { const index = this.parseExpression(); this.expect('OP', ']'); expr = { type: 'Index', object: expr, index, line: expr.line }; }
      else if (this.match('OP', '(')) {
        const args = [];
        if (this.peek().value !== ')') do { args.push(this.parseExpression()); } while (this.match('OP', ','));
        this.expect('OP', ')');
        expr = { type: 'Call', callee: expr, args, line: expr.line };
      } else if (this.match('OP', '.')) { expr = { type: 'Member', object: expr, member: this.expect('ID').value, line: expr.line }; }
      else if (this.match('OP', '->')) { expr = { type: 'PtrMember', object: expr, member: this.expect('ID').value, line: expr.line }; }
      else break;
    }
    return expr;
  }
  parsePrimary() {
    const t = this.peek(); const line = t.line;
    if (t.type === 'NUM') return { type: 'Number', value: this.advance().value, line };
    if (t.type === 'STRING') return { type: 'String', value: this.advance().value, line };
    if (t.type === 'ID') return { type: 'Identifier', name: this.advance().value, line };
    if (t.value === 'NULL') { this.advance(); return { type: 'Number', value: 0, line }; }
    if (t.value === 'true') { this.advance(); return { type: 'Number', value: 1, line }; }
    if (t.value === 'false') { this.advance(); return { type: 'Number', value: 0, line }; }
    if (t.value === 'sizeof') {
      this.advance(); this.expect('OP', '(');
      let depth = 1;
      while (depth > 0 && this.peek().type !== 'EOF') {
        if (this.peek().value === '(') depth++; else if (this.peek().value === ')') depth--;
        this.advance();
      }
      return { type: 'Number', value: 4, line };
    }
    if (this.match('OP', '(')) { const expr = this.parseExpression(); this.expect('OP', ')'); return expr; }
    this.advance();
    return { type: 'Number', value: 0, line };
  }
}

// ============================================================================
// INTERPRETER
// ============================================================================
class Interpreter {
  constructor(ast, maxSteps = 10000) {
    this.ast = ast;
    this.maxSteps = maxSteps;
    this.steps = [];
    this.stepCount = 0;
    this.globalVars = {};
    this.callStack = [];
    this.heap = new Map();
    this.nextHeapAddr = 0x1000;
    this.output = '';
    this.breakFlag = false;
    this.continueFlag = false;
    this.returnValue = null;
  }

  run() {
    try {
      for (const node of this.ast.body) {
        if (node.type === 'VarDecl' || node.type === 'ArrayDecl') this.execute(node);
      }
      const main = this.ast.functions['main'];
      if (!main) return { success: false, steps: [], errors: ['No main() function found'] };
      this.callStack.push({ name: 'main', locals: {}, returnAddr: -1 });
      this.executeBlock(main.body);
      this.callStack.pop();
      return { success: true, steps: this.steps, totalSteps: this.steps.length, errors: [], output: this.output };
    } catch (err) {
      return { success: false, steps: this.steps, totalSteps: this.steps.length, errors: [err.message], output: this.output };
    }
  }

  recordStep(lineNo) {
    if (this.stepCount++ > this.maxSteps)
      throw new Error('Maximum steps exceeded — possible infinite loop');

    // FIX 3: Include globals in each frame snapshot so the visualizer
    // shows global arrays (stack[], top) alongside frame locals
    const stackFrames = this.callStack.map((frame, idx) => {
      const locals = { ...frame.locals };
      // Merge globals into the innermost (current) frame so they're visible
      if (idx === this.callStack.length - 1) {
        for (const [k, v] of Object.entries(this.globalVars)) {
          if (!(k in locals)) locals[`[global] ${k}`] = Array.isArray(v) ? [...v] : v;
        }
      }
      return { name: frame.name, locals };
    });

    const memory = {};
    for (const [k, v] of Object.entries(this.globalVars)) {
      if (Array.isArray(v)) v.forEach((el, i) => { memory[`${k}[${i}]`] = el; });
      else memory[k] = v;
    }
    for (const frame of this.callStack) {
      for (const [k, v] of Object.entries(frame.locals)) {
        if (Array.isArray(v)) v.forEach((el, i) => { memory[`${frame.name}.${k}[${i}]`] = el; });
        else memory[`${frame.name}.${k}`] = v;
      }
    }

    this.steps.push({
      stepNumber: this.steps.length + 1,
      lineNo,
      registers: {
        pc: lineNo,
        sp: 4096 - this.callStack.length * 64,
        fp: 4096 - Math.max(0, this.callStack.length - 1) * 64
      },
      memory,
      stackFrames,
      instructionPointer: `line:${lineNo}`,
      timestamp: Date.now()
    });
  }

  // ── Variable lookup: local → global ──────────────────────────────────────
  getVar(name) {
    for (let i = this.callStack.length - 1; i >= 0; i--)
      if (name in this.callStack[i].locals) return this.callStack[i].locals[name];
    if (name in this.globalVars) return this.globalVars[name];
    return 0;
  }

  // FIX 4: setVar correctly mutates arrays — no copy-on-write
  setVar(name, value) {
    for (let i = this.callStack.length - 1; i >= 0; i--) {
      if (name in this.callStack[i].locals) { this.callStack[i].locals[name] = value; return; }
    }
    if (name in this.globalVars) { this.globalVars[name] = value; return; }
    if (this.callStack.length > 0) this.callStack[this.callStack.length - 1].locals[name] = value;
    else this.globalVars[name] = value;
  }

  // ── Execute statements ────────────────────────────────────────────────────
  execute(node) {
    if (!node) return;
    switch (node.type) {
      case 'VarDecl': {
        this.recordStep(node.line);
        for (const v of node.vars) this.setVar(v.name, v.init ? this.evaluate(v.init) : 0);
        return;
      }
      case 'ArrayDecl': {
        this.recordStep(node.line);
        // FIX 5: evaluate sizeExpr (handles #define'd sizes)
        const size = node.sizeExpr ? Math.max(0, Math.trunc(this.evaluate(node.sizeExpr))) : (node.init?.elements?.length || 0);
        const arr = new Array(size).fill(0);
        if (node.init?.elements)
          for (let i = 0; i < node.init.elements.length && i < size; i++)
            arr[i] = this.evaluate(node.init.elements[i]);
        this.setVar(node.name, arr);
        return;
      }
      case 'Block': this.executeBlock(node); return;
      case 'If': {
        this.recordStep(node.line);
        if (this.evaluate(node.condition)) this.execute(node.consequent);
        else if (node.alternate) this.execute(node.alternate);
        return;
      }
      case 'While': {
        while (true) {
          this.recordStep(node.line);
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
          if (node.init.type === 'VarDecl') this.execute(node.init);
          else this.evaluate(node.init);
        }
        while (true) {
          if (node.condition) { this.recordStep(node.condition.line || node.line); if (!this.evaluate(node.condition)) break; }
          this.execute(node.body);
          if (this.breakFlag) { this.breakFlag = false; break; }
          if (this.continueFlag) this.continueFlag = false;
          if (this.returnValue !== null) break;
          if (node.update) this.evaluate(node.update);
        }
        return;
      }
      case 'Return': {
        this.recordStep(node.line);
        this.returnValue = node.value ? this.evaluate(node.value) : 0;
        return;
      }
      case 'Break':    this.breakFlag = true; return;
      case 'Continue': this.continueFlag = true; return;
      case 'ExprStmt': {
        this.recordStep(node.line);
        this.evaluate(node.expr);
        return;
      }
    }
  }

  executeBlock(block) {
    for (const stmt of block.statements) {
      this.execute(stmt);
      if (this.breakFlag || this.continueFlag || this.returnValue !== null) break;
    }
  }

  // ── Evaluate expressions ──────────────────────────────────────────────────
  evaluate(node) {
    if (!node) return 0;
    switch (node.type) {
      case 'Number':     return node.value;
      case 'String':     return node.value;
      case 'Identifier': return this.getVar(node.name);
      case 'Binary': {
        const l = this.evaluate(node.left);
        const r = this.evaluate(node.right);
        switch (node.op) {
          case '+': return l + r; case '-': return l - r;
          case '*': return l * r;
          case '/': return r === 0 ? 0 : Math.trunc(l / r);
          case '%': return r === 0 ? 0 : l % r;
          case '<': return l < r ? 1 : 0; case '>': return l > r ? 1 : 0;
          case '<=': return l <= r ? 1 : 0; case '>=': return l >= r ? 1 : 0;
          case '==': return l === r ? 1 : 0; case '!=': return l !== r ? 1 : 0;
          case '&&': return (l && r) ? 1 : 0; case '||': return (l || r) ? 1 : 0;
          default: return 0;
        }
      }
      case 'Unary': {
        if (node.op === '++pre') { const n = node.operand.name; const v = this.getVar(n) + 1; this.setVar(n, v); return v; }
        if (node.op === '--pre') { const n = node.operand.name; const v = this.getVar(n) - 1; this.setVar(n, v); return v; }
        if (node.op === '++post') { const n = node.operand.name; const v = this.getVar(n); this.setVar(n, v + 1); return v; }
        if (node.op === '--post') { const n = node.operand.name; const v = this.getVar(n); this.setVar(n, v - 1); return v; }
        const operand = this.evaluate(node.operand);
        switch (node.op) {
          case '-': return -operand; case '!': return operand ? 0 : 1;
          case '&': return this.nextHeapAddr++;
          case '*': return this.heap.get(operand) || 0;
          default: return operand;
        }
      }
      case 'Assignment': {
        const right = this.evaluate(node.right);
        if (node.left.type === 'Identifier') {
          let val = right;
          if (node.op !== '=') {
            const cur = this.getVar(node.left.name);
            switch (node.op) {
              case '+=': val = cur + right; break; case '-=': val = cur - right; break;
              case '*=': val = cur * right; break;
              case '/=': val = right === 0 ? cur : Math.trunc(cur / right); break;
              case '%=': val = right === 0 ? cur : cur % right; break;
            }
          }
          this.setVar(node.left.name, val);
          return val;
        }
        if (node.left.type === 'Index') {
          // FIX 6: Mutate the array in-place through the reference
          const arrName = node.left.object.name;
          const arr = this.getVar(arrName);
          const idx = this.evaluate(node.left.index);
          if (Array.isArray(arr)) {
            arr[idx] = right;
            // No need to setVar — arr is a reference, already mutated in-place
          }
          return right;
        }
        return right;
      }
      case 'Index': {
        const arr = this.getVar(node.object.name);
        const idx = this.evaluate(node.index);
        return Array.isArray(arr) ? (arr[idx] ?? 0) : 0;
      }
      case 'Call': {
        const funcName = node.callee.name;
        // Built-ins
        if (funcName === 'printf') {
          const fmt = node.args[0] ? this.evaluate(node.args[0]) : '';
          const args = node.args.slice(1).map(a => this.evaluate(a));
          let out = String(fmt); let argIdx = 0;
          out = out.replace(/%[difsc%]/g, spec => {
            if (spec === '%%') return '%';
            const v = args[argIdx++];
            if (spec === '%c') return typeof v === 'number' ? String.fromCharCode(v) : String(v);
            return v !== undefined ? String(v) : '';
          });
          this.output += out;
          return out.length;
        }
        if (funcName === 'scanf' || funcName === 'puts') return 0;
        // User-defined
        const func = this.ast.functions[funcName];
        if (!func) return 0;
        const frame = { name: funcName, locals: {}, returnAddr: node.line };
        for (let i = 0; i < func.params.length; i++) {
          const param = func.params[i];
          if (!param.name) continue;
          frame.locals[param.name] = i < node.args.length ? this.evaluate(node.args[i]) : 0;
        }
        this.callStack.push(frame);
        this.recordStep(func.line);
        const prevReturn = this.returnValue;
        this.returnValue = null;
        this.executeBlock(func.body);
        const ret = this.returnValue ?? 0;
        this.returnValue = prevReturn !== null ? prevReturn : null; // restore outer context
        this.returnValue = null; // clear for caller
        this.callStack.pop();
        return ret;
      }
      default: return 0;
    }
  }
}

// ============================================================================
// EXPORT
// ============================================================================
export async function traceExecution(code, breakpoints = []) {
  try {
    // Step 1: tokenize
    const rawTokens = tokenize(code);
    // Step 2: substitute #define macros — this fixes MAX, etc.
    const tokens = applyDefines(rawTokens);
    // Step 3: parse + interpret
    const ast = new Parser(tokens).parseProgram();
    const result = new Interpreter(ast).run();
    if (!result.success) return result;

    // Step 4: filter by breakpoints if requested
    if (breakpoints.length === 0) return result;
    const bpSet = new Set(breakpoints.filter(n => Number.isInteger(n) && n > 0));
    const filtered = result.steps.filter(s => bpSet.has(s.lineNo));
    return { ...result, steps: filtered, totalSteps: filtered.length };
  } catch (err) {
    return { success: false, steps: [], totalSteps: 0, errors: [err.message || 'Parse error'] };
  }
}
