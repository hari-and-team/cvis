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

// ============================================================================
// PARSER
// ============================================================================

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
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
    return TYPES.has(t.value) || t.value === 'void' || t.value === 'struct';
  }

  parseDeclaration() {
    const line = this.peek().line;
    let typeName = this.parseType();
    
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

    // Array declaration
    if (this.match('OP', '[')) {
      const size = this.peek().type === 'NUM' ? this.advance().value : 0;
      this.expect('OP', ']');
      let init = null;
      if (this.match('OP', '=')) {
        init = this.parseInitializer();
      }
      this.expect('OP', ';');
      return { type: 'ArrayDecl', varType: typeName, name, size, init, line };
    }

    // Variable declaration
    let init = null;
    if (this.match('OP', '=')) {
      init = this.parseExpression();
    }

    // Multiple declarations
    const vars = [{ name, init }];
    while (this.match('OP', ',')) {
      while (this.match('OP', '*')) typeName += '*';
      const vname = this.expect('ID').value;
      let vinit = null;
      if (this.match('OP', '=')) {
        vinit = this.parseExpression();
      }
      vars.push({ name: vname, init: vinit });
    }
    this.expect('OP', ';');
    return { type: 'VarDecl', varType: typeName, vars, line };
  }

  parseType() {
    let type = '';
    while (this.peek().type === 'KW' && TYPES.has(this.peek().value)) {
      type += (type ? ' ' : '') + this.advance().value;
    }
    return type || 'int';
  }

  parseParams() {
    const params = [];
    if (this.peek().value !== ')') {
      do {
        let ptype = this.parseType();
        while (this.match('OP', '*')) ptype += '*';
        const pname = this.match('ID')?.value || '';
        // Array param
        if (this.match('OP', '[')) {
          this.match('OP', ']');
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
          elements.push(this.parseExpression());
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
    
    // Memory model
    this.globalVars = {};
    this.callStack = []; // Array of { name, locals, returnAddr }
    this.heap = new Map(); // address -> value
    this.nextHeapAddr = 0x1000;
    
    this.output = '';
    this.breakFlag = false;
    this.continueFlag = false;
    this.returnValue = null;
  }

  run() {
    try {
      // Execute global declarations first
      for (const node of this.ast.body) {
        if (node.type === 'VarDecl' || node.type === 'ArrayDecl') {
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
      return {
        success: false,
        steps: this.steps,
        totalSteps: this.steps.length,
        errors: [err.message]
      };
    }
  }

  recordStep(lineNo, _description = '') {
    if (this.stepCount++ > this.maxSteps) {
      throw new Error('Maximum steps exceeded (possible infinite loop)');
    }

    // Collect all variables: globals + all stack frames
    const memory = { ...this.globalVars };
    for (const frame of this.callStack) {
      for (const [k, v] of Object.entries(frame.locals)) {
        memory[`${frame.name}.${k}`] = v;
      }
    }

    // Build registers showing call stack info
    const registers = {
      pc: lineNo,
      sp: 4096 - this.callStack.length * 64,
      fp: this.callStack.length > 0 ? 4096 - (this.callStack.length - 1) * 64 : 4096
    };

    // Build call stack representation
    const stackFrames = this.callStack.map(frame => ({
      name: frame.name,
      locals: { ...frame.locals }
    }));

    this.steps.push({
      stepNumber: this.steps.length + 1,
      lineNo,
      registers,
      memory,
      stackFrames,
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

  execute(node) {
    if (!node) return undefined;

    switch (node.type) {
      case 'VarDecl': {
        this.recordStep(node.line, `Variable declaration`);
        for (const v of node.vars) {
          const val = v.init ? this.evaluate(v.init) : 0;
          this.setVar(v.name, val);
        }
        return;
      }

      case 'ArrayDecl': {
        this.recordStep(node.line, `Array declaration: ${node.name}`);
        const size = node.size || (node.init?.elements?.length || 0);
        const arr = new Array(size).fill(0);
        if (node.init?.elements) {
          for (let i = 0; i < node.init.elements.length && i < size; i++) {
            arr[i] = this.evaluate(node.init.elements[i]);
          }
        }
        this.setVar(node.name, arr);
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
          if (node.init.type === 'VarDecl' || node.init.type === 'ExprStmt') {
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
          case '&&': return (left && right) ? 1 : 0;
          case '||': return (left || right) ? 1 : 0;
          default: return 0;
        }
      }

      case 'Unary': {
        if (node.op === '++pre' || node.op === '--pre') {
          const name = node.operand.name;
          const val = this.getVar(name) + (node.op === '++pre' ? 1 : -1);
          this.setVar(name, val);
          return val;
        }
        if (node.op === '++post' || node.op === '--post') {
          const name = node.operand.name;
          const val = this.getVar(name);
          this.setVar(name, val + (node.op === '++post' ? 1 : -1));
          return val;
        }
        const operand = this.evaluate(node.operand);
        switch (node.op) {
          case '-': return -operand;
          case '!': return operand ? 0 : 1;
          case '&': return this.nextHeapAddr++; // Simplified address-of
          case '*': return this.heap.get(operand) || 0; // Simplified dereference
          default: return operand;
        }
      }

      case 'Assignment': {
        const right = this.evaluate(node.right);
        if (node.left.type === 'Identifier') {
          const name = node.left.name;
          let val = right;
          if (node.op !== '=') {
            const left = this.getVar(name);
            switch (node.op) {
              case '+=': val = left + right; break;
              case '-=': val = left - right; break;
              case '*=': val = left * right; break;
              case '/=': val = right === 0 ? left : Math.trunc(left / right); break;
              case '%=': val = right === 0 ? left : left % right; break;
            }
          }
          this.setVar(name, val);
          return val;
        }
        if (node.left.type === 'Index') {
          const arr = this.getVar(node.left.object.name);
          const idx = this.evaluate(node.left.index);
          if (Array.isArray(arr)) {
            arr[idx] = right;
          }
          return right;
        }
        return right;
      }

      case 'Index': {
        const arr = this.getVar(node.object.name);
        const idx = this.evaluate(node.index);
        if (Array.isArray(arr)) {
          return arr[idx] ?? 0;
        }
        return 0;
      }

      case 'Call': {
        const funcName = node.callee.name;
        
        // Built-in functions
        if (funcName === 'printf') {
          const fmt = node.args[0] ? this.evaluate(node.args[0]) : '';
          const args = node.args.slice(1).map(a => this.evaluate(a));
          let output = String(fmt);
          let argIdx = 0;
          output = output.replace(/%[difs]/g, () => {
            return args[argIdx++] ?? '';
          });
          this.output += output;
          return 0;
        }
        
        if (funcName === 'scanf') {
          // Simplified - just return 0
          return 0;
        }

        // User-defined function
        const func = this.ast.functions[funcName];
        if (!func) return 0;

        // Create new stack frame
        const frame = { name: funcName, locals: {}, returnAddr: node.line };
        
        // Bind parameters
        for (let i = 0; i < func.params.length; i++) {
          const param = func.params[i];
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

export async function traceExecution(code, breakpoints = []) {
  try {
    const tokens = tokenize(code);
    const parser = new Parser(tokens);
    const ast = parser.parseProgram();
    const interpreter = new Interpreter(ast);
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
    return {
      success: false,
      steps: [],
      totalSteps: 0,
      errors: [err.message || 'Parse error']
    };
  }
}
