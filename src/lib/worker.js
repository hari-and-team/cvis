// Auto-extracted from App.jsx
const TWO_CHAR_OPS = ["==","!=","<=",">=","&&","||","++","--","+=","-=","*=","/=","%=","->"];

function tokenize(src) {
  const tokens = [];
  let lineNo = 1;
  let i = 0;
  const KEYWORDS = new Set([
    "int","float","double","char","void","return","if","else","while","for",
    "do","break","continue","struct","typedef","sizeof","long","short",
    "unsigned","signed","const","static","NULL","true","false",
    "printf","scanf","fprintf","sprintf","stderr","stdout",
  ]);

  while (i < src.length) {
    const line = lineNo;
    const ch = src[i];
    if (ch === "\n") { lineNo++; i++; continue; }
    if (ch === " " || ch === "\t" || ch === "\r") { i++; continue; }

    if (ch === "/" && src[i+1] === "/") { while (i < src.length && src[i] !== "\n") i++; continue; }
    if (ch === "/" && src[i+1] === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i+1] === "/")) {
        if (src[i] === "\n") lineNo++;
        i++;
      }
      i += 2; continue;
    }

    if (ch === "#") { let s = ""; while (i < src.length && src[i] !== "\n") s += src[i++]; tokens.push({t:"prep",v:s.trim(),line}); continue; }

    if (ch === '"') {
      let s = ""; i++;
      while (i < src.length && src[i] !== '"') {
        if (src[i] === "\\") {
          i++;
          const e = src[i];
          s += e==="n"?"\n":e==="t"?"\t":e==="\\"?"\\":e==='"'?'"':e==="0"?"\0":e==="r"?"\r":e;
        } else s += src[i];
        i++;
      }
      i++; tokens.push({t:"str",v:s,line}); continue;
    }

    if (ch === "'") {
      let s = ""; i++;
      while (i < src.length && src[i] !== "'") {
        if (src[i] === "\\") { i++; s += src[i]==="n"?"\n":src[i]==="0"?"\0":src[i]; }
        else s += src[i];
        i++;
      }
      i++; tokens.push({t:"num",v:s.length?s.charCodeAt(0):0,line}); continue;
    }

    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(src[i+1]||""))) {
      let n = "";
      while (i < src.length && /[0-9a-fA-FxX._eE]/.test(src[i])) n += src[i++];
      tokens.push({t:"num",v:parseFloat(n)||0,line}); continue;
    }

    if (/[a-zA-Z_]/.test(ch)) {
      let w = "";
      while (i < src.length && /[a-zA-Z0-9_]/.test(src[i])) w += src[i++];
      tokens.push({t:KEYWORDS.has(w)?"kw":"id",v:w,line}); continue;
    }

    if (ch === "<" && src[i+1] === "<") { tokens.push({t:"op",v:"LSHIFT",line}); i+=2; continue; }
    if (ch === ">" && src[i+1] === ">") { tokens.push({t:"op",v:"RSHIFT",line}); i+=2; continue; }

    const two = src.slice(i, i+2);
    if (TWO_CHAR_OPS.includes(two)) { tokens.push({t:"op",v:two,line}); i+=2; continue; }

    tokens.push({t:"p",v:ch,line}); i++;
  }
  tokens.push({t:"eof",v:"",line:lineNo});
  return tokens;
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  PARSER
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function parse(tokens) {
  let pos = 0;
  const peek = (off=0) => tokens[Math.min(pos+off, tokens.length-1)];
  const consume = () => tokens[Math.min(pos++, tokens.length-1)];
  const expect = (v) => {
    const t = consume();
    if (t.v !== v) throw Object.assign(new Error(`Expected '${v}' got '${t.v}'`), {cline:t.line});
    return t;
  };
  const match = (v) => { if (peek().v === v) { consume(); return true; } return false; };

  const TYPE_KW = new Set(["int","float","double","char","void","long","short","unsigned","signed","const","static"]);
  const typedefs = new Set();

  // FIX: unified isTypeAt that checks at a given offset
  const isTypeAt = (off=0) => TYPE_KW.has(peek(off).v) || peek(off).v==="struct" || typedefs.has(peek(off).v);
  const isType = () => isTypeAt(0);

  function consumeType() {
    if (peek().v === "struct") { consume(); if (peek().t==="id") consume(); }
    else while (TYPE_KW.has(peek().v)) consume();
    while (TYPE_KW.has(peek().v)) consume();
  }

  function parseStructBody() {
    expect("{");
    const fields = [];
    while (peek().v !== "}") {
      if (peek().v === "struct") { consume(); consume(); }
      else while (TYPE_KW.has(peek().v)) consume();
      const isPtr = match("*");
      if (peek().t === "id" || peek().t === "kw") {
        const fname = consume().v;
        if (peek().v === "[") { consume(); if (peek().v !== "]") parsePrimary(); match("]"); }
        fields.push({name:fname, isPtr});
      }
      match(";");
    }
    expect("}");
    return fields;
  }

  function prog() {
    const body = [];
    while (peek().t !== "eof") {
      if (peek().t === "prep") { consume(); continue; }
      try { body.push(topLevel()); }
      catch(e) {
        let safe = 0;
        while (peek().t !== "eof" && peek().v !== ";" && peek().v !== "}" && safe++ < 60) consume();
        match(";");
      }
    }
    return {kind:"Program", body};
  }

  function topLevel() {
    const line = peek().line;

    if (peek().v === "typedef") {
      consume();
      if (peek().v === "struct") {
        consume();
        let sname = null;
        if (peek().t === "id" && peek(1).v !== "{") sname = consume().v;
        let fields = null;
        if (peek().v === "{") fields = parseStructBody();
        const tname = consume().v;
        typedefs.add(tname);
        match(";");
        return {kind:"TypedefStruct", sname:sname||tname, tname, fields, line};
      }
      while (peek().v !== ";") consume(); match(";");
      return {kind:"Noop"};
    }

    if (peek().v === "struct" && peek(1).t === "id" && peek(2).v === "{") {
      consume(); const sname = consume().v;
      const fields = parseStructBody();
      match(";");
      return {kind:"StructDef", name:sname, fields, line};
    }

    consumeType();
    const isPtr = match("*");
    if (peek().t !== "id" && peek().t !== "kw") { match(";"); return {kind:"Noop"}; }
    const name = consume();
    if (peek().v === "(") return parseFuncDef(name.v, line);

    if (peek().v === "[") {
      consume(); let sz=null; if (peek().v !== "]") sz=expr(); expect("]");
      let init=null;
      if (peek().v==="=" && peek(1).v==="{") { consume(); expect("{"); const els=[]; while(peek().v!=="}"){ els.push(expr()); match(","); } expect("}"); init={kind:"ArrLit",els}; }
      match(";"); return {kind:"GArr",name:name.v,sz,init,line};
    }
    let init=null; if (match("=")) init=expr(); match(";");
    return {kind:"GVar",name:name.v,init,line};
  }

  function parseFuncDef(name, line) {
    expect("("); const params = [];
    while (peek().v !== ")") {
      if (peek().v === "...") { consume(); break; }
      if (peek().v === "void" && peek(1).v === ")") { consume(); break; }
      consumeType();
      const isPtr = match("*");
      if (peek().t==="id"||peek().t==="kw") {
        const pn = consume().v;
        if (peek().v==="[") { consume(); match("]"); }
        params.push({name:pn, isPtr});
      }
      match(",");
    }
    expect(")");
    if (peek().v===";") { consume(); return {kind:"FDecl",name,params,line}; }
    return {kind:"FDef",name,params,body:block(),line};
  }

  function block() {
    const line = peek().line; expect("{");
    const stmts = [];
    while (peek().v !== "}") {
      try { stmts.push(stmt()); }
      catch(e) {
        let safe=0;
        while (peek().t!=="eof" && peek().v!==";" && peek().v!=="}" && safe++<30) consume();
        match(";");
      }
    }
    expect("}"); return {kind:"Block",stmts,line};
  }

  const isVarDecl = () => isType();

  function stmt() {
    const t = peek(); const line = t.line;
    if (t.v==="{") return block();
    if (t.v==="if") {
      consume(); expect("("); const cond=expr(); expect(")");
      const then=stmt(); let els=null;
      if (peek().v==="else") { consume(); els=stmt(); }
      return {kind:"If",cond,then,els,line};
    }
    if (t.v==="while") { consume(); expect("("); const cond=expr(); expect(")"); return {kind:"While",cond,body:stmt(),line}; }
    if (t.v==="for") {
      consume(); expect("(");
      let init=null;
      if (peek().v!==";") {
        if (isVarDecl()) {
          consumeType(); match("*");
          const vn=consume().v; let vi=null; if (match("=")) vi=expr();
          init={kind:"VDecl",name:vn,init:vi,line};
        } else init=expr();
      }
      expect(";"); let cond=null; if (peek().v!==";") cond=expr(); expect(";");
      let upd=null; if (peek().v!==")") upd=expr(); expect(")");
      return {kind:"For",init,cond,upd,body:stmt(),line};
    }
    if (t.v==="do") {
      consume(); const body=stmt(); expect("while"); expect("(");
      const cond=expr(); expect(")"); expect(";");
      return {kind:"DoWhile",cond,body,line};
    }
    if (t.v==="return") { consume(); let val=null; if (peek().v!==";") val=expr(); match(";"); return {kind:"Return",val,line}; }
    if (t.v==="break") { consume(); match(";"); return {kind:"Break",line}; }
    if (t.v==="continue") { consume(); match(";"); return {kind:"Cont",line}; }
    if (t.v==="switch") {
      consume(); expect("("); const cond=expr(); expect(")"); expect("{");
      const cases=[]; let def=null;
      while (peek().v!=="}") {
        if (peek().v==="case") {
          consume(); const val=expr(); expect(":");
          const body=[]; while(peek().v!=="case"&&peek().v!=="default"&&peek().v!=="}") body.push(stmt());
          cases.push({val,body});
        } else if (peek().v==="default") {
          consume(); expect(":");
          const body=[]; while(peek().v!=="case"&&peek().v!=="default"&&peek().v!=="}") body.push(stmt());
          def=body;
        } else consume();
      }
      expect("}"); return {kind:"Switch",cond,cases,def,line};
    }

    if (isVarDecl()) {
      let structType=null; let typeStr="int";
      if (peek().v==="struct") { consume(); structType=consume().v; typeStr=structType; }
      else { const tp=[]; while(TYPE_KW.has(peek().v)) tp.push(consume().v); typeStr=tp.join(" ")||"int"; }
      const isPtr=match("*");
      const vn=consume().v;
      if (peek().v==="[") {
        consume(); let sz=null; if (peek().v!=="]") sz=expr(); expect("]");
        let init=null;
        if (peek().v==="=" && peek(1).v==="{") { consume(); expect("{"); const els=[]; while(peek().v!=="}"){ els.push(expr()); match(","); } expect("}"); init={kind:"ArrLit",els}; }
        else if (match("=")) init=expr();
        match(";"); return {kind:"ArrDecl",name:vn,sz,init,structType,type:typeStr,line};
      }
      let init=null; if (match("=")) init=expr();
      const decls=[{name:vn,init,isPtr}];
      while (match(",")) { match("*"); const n2=consume().v; let i2=null; if (match("=")) i2=expr(); decls.push({name:n2,init:i2}); }
      match(";");
      if (decls.length===1) return {kind:"VDecl",name:vn,init,isPtr,structType,type:typeStr,line};
      return {kind:"MDecl",decls,structType,type:typeStr,line};
    }
    const e=expr(); match(";"); return {kind:"Estmt",expr:e,line};
  }

  function expr() { return assign(); }
  function assign() {
    let l=ternary();
    const AOPS = ["=","+=","-=","*=","/=","%="];
    if (AOPS.includes(peek().v)) { const op=consume().v; return {kind:"Assign",op,left:l,right:assign(),line:l.line}; }
    return l;
  }
  function ternary() {
    let c=orExpr();
    if (match("?")) { const th=expr(); expect(":"); return {kind:"Tern",c,th,el:expr(),line:c.line}; }
    return c;
  }
  function orExpr()  { let l=andExpr(); while(peek().v==="||"){consume();l={kind:"Bin",op:"||",l,r:andExpr(),line:l.line};} return l; }
  function andExpr() { let l=eqExpr();  while(peek().v==="&&"){consume();l={kind:"Bin",op:"&&",l,r:eqExpr(), line:l.line};} return l; }
  function eqExpr()  { let l=relExpr(); while(peek().v==="=="||peek().v==="!="){const op=consume().v;l={kind:"Bin",op,l,r:relExpr(),line:l.line};} return l; }
  function relExpr() { let l=addExpr(); while(["<",">","<=",">="].includes(peek().v)){const op=consume().v;l={kind:"Bin",op,l,r:addExpr(),line:l.line};} return l; }
  function addExpr() { let l=mulExpr(); while(peek().v==="+"||peek().v==="-"){const op=consume().v;l={kind:"Bin",op,l,r:mulExpr(),line:l.line};} return l; }
  function mulExpr() { let l=unary();   while(peek().v==="*"||peek().v==="/"||peek().v==="%"){const op=consume().v;l={kind:"Bin",op,l,r:unary(),line:l.line};} return l; }

  function unary() {
    const t = peek();
    if (t.v==="!") { consume(); return {kind:"Unary",op:"!",expr:unary(),line:t.line}; }
    if (t.v==="-") { consume(); return {kind:"Unary",op:"-",expr:unary(),line:t.line}; }
    if (t.v==="~") { consume(); return {kind:"Unary",op:"~",expr:unary(),line:t.line}; }
    if (t.v==="&") { consume(); return {kind:"AddrOf",expr:postfix(),line:t.line}; }
    if (t.v==="*") { consume(); return {kind:"Deref",expr:unary(),line:t.line}; }
    if (t.v==="++") { consume(); return {kind:"PreInc",op:"++",expr:unary(),line:t.line}; }
    if (t.v==="--") { consume(); return {kind:"PreInc",op:"--",expr:unary(),line:t.line}; }
    if (t.v==="sizeof") {
      consume();
      if (match("(")) {
        if (isVarDecl()) { while(peek().v!==")") consume(); expect(")"); return {kind:"Num",v:4,line:t.line}; }
        const e = expr();
        expect(")");
        return {kind:"Sizeof",expr:e,line:t.line};
      }
      return {kind:"Sizeof",expr:unary(),line:t.line};
    }
    // FIX: Cast detection - use isTypeAt(1) instead of broken isType.call(null, peek(1))
    if (t.v==="(") {
      const saved = pos;
      if (isTypeAt(1)) {
        try {
          consume(); // consume "("
          consumeType(); match("*"); expect(")");
          return unary();
        } catch(e) { pos = saved; }
      }
    }
    return postfix();
  }

  function postfix() {
    let e = parsePrimary();
    while (true) {
      if (peek().v==="[") { consume(); const idx=expr(); expect("]"); e={kind:"Idx",arr:e,idx,line:e.line}; }
      else if (peek().v==="(") { consume(); const args=[]; while(peek().v!==")"){args.push(expr());match(",");} expect(")"); e={kind:"Call",fn:e,args,line:e.line}; }
      else if (peek().v===".") { consume(); e={kind:"Field",obj:e,field:consume().v,line:e.line}; }
      else if (peek().v==="->") { consume(); e={kind:"Arrow",obj:e,field:consume().v,line:e.line}; }
      else if (peek().v==="++") { consume(); e={kind:"PostInc",op:"++",expr:e,line:e.line}; }
      else if (peek().v==="--") { consume(); e={kind:"PostInc",op:"--",expr:e,line:e.line}; }
      else break;
    }
    return e;
  }

  function parsePrimary() {
    const t = peek();
    if (t.t==="num") { consume(); return {kind:"Num",v:t.v,line:t.line}; }
    if (t.t==="str") { consume(); return {kind:"Str",v:t.v,line:t.line}; }
    if (t.v==="NULL"||t.v==="false") { consume(); return {kind:"Num",v:0,line:t.line}; }
    if (t.v==="true") { consume(); return {kind:"Num",v:1,line:t.line}; }
    if (t.t==="id"||t.t==="kw") { consume(); return {kind:"Id",name:t.v,line:t.line}; }
    if (t.v==="(") {
      consume();
      if (isVarDecl()) { consumeType(); match("*"); expect(")"); return unary(); }
      const e=expr(); expect(")"); return e;
    }
    throw Object.assign(new Error(`Unexpected token '${t.v}'`), {cline:t.line});
  }

  return prog();
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  INTERPRETER
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
const STEP_LIMIT = 5000;
const NULL_ADDR = 0;

function interpret(ast, stdinStr) {
  const heap = {};
  let heapNext = 256;
  const structs = {};
  const functions = {};
  const globals = {};
  const steps = [];
  let stdout = "";
  let stepCount = 0;
  const stdinLines = (stdinStr||"").split("\n");
  const stdinTokens = (stdinStr||"").trim().split(/\s+/).filter(Boolean);
  let stdinPos = 0;
  let stdinTokPos = 0;
  const callStack = [];
  const curFrame = () => callStack[callStack.length-1];
  const STACK_BASE = 0x7ffc0000;
  function sizeOf(type, isPtr) {
    if (isPtr) return 4;
    if (!type) return 4;
    const t = String(type).toLowerCase();
    if (t.includes("char")) return 1;
    if (t.includes("short")) return 2;
    if (t.includes("long long") || t.includes("double")) return 8;
    return 4;
  }

  const mkErr = (msg, line) => Object.assign(new Error(msg), {cline:line});
  let lastNode = null;
  let lastLine = null;

  function captureState() {
    return {
      globals: deepCopy(globals),
      stack: callStack.map(f => ({name:f.name, locals:deepCopy(f.locals), addrs:deepCopy(f.addrs||{})})),
      heap: deepCopy(heap),
    };
  }

  function wrapError(e) {
    if (!e) return e;
    if (!e._trace) {
      e._trace = {
        node: lastNode ? { kind: lastNode.kind, line: lastNode.line } : null,
        line: e.cline || lastLine || 0,
        state: captureState(),
        stack: e.stack || "",
      };
      try {
        console.log("Current AST node:", lastNode);
        console.log("Execution state:", e._trace.state);
      } catch {}
    }
    return e;
  }

  function snap(line, desc) {
    if (++stepCount > STEP_LIMIT) throw mkErr("Step limit - possible infinite loop", line);
    steps.push({
      line, desc,
      stack: callStack.map(f => ({name:f.name, locals:deepCopy(f.locals), addrs:deepCopy(f.addrs||{})})),
      globals: deepCopy(globals),
      heap: deepCopy(heap),
      stdout,
    });
  }

  function deepCopy(x) {
    if (x === null || x === undefined || typeof x !== "object") return x;
    if (Array.isArray(x)) return x.map(deepCopy);
    const r = {};
    for (const k in x) r[k] = deepCopy(x[k]);
    return r;
  }

  function readVar(name, line) {
    for (let i=callStack.length-1; i>=0; i--)
      if (name in callStack[i].locals) return callStack[i].locals[name];
    if (name in globals) return globals[name];
    // FIX: Return 0 for unknown vars instead of throwing - avoids crashes on forward refs / undeclared
    return 0;
  }

  function writeVar(name, val, line) {
    for (let i=callStack.length-1; i>=0; i--) {
      if (name in callStack[i].locals) { callStack[i].locals[name]=val; return; }
    }
    if (name in globals) { globals[name]=val; return; }
    // FIX: If not found anywhere, write to current frame (handles implicit decls gracefully)
    if (callStack.length > 0) { callStack[callStack.length-1].locals[name]=val; return; }
    globals[name] = val;
  }

  function heapAlloc(sname) {
    const addr = heapNext; heapNext += 64;
    const fields = structs[sname] || [];
    const obj = {__type:"struct", __sname:sname};
    fields.forEach(f => { obj[f.name] = f.isPtr ? NULL_ADDR : 0; });
    heap[addr] = obj;
    return addr;
  }

  function heapGet(addr, field) {
    if (addr===NULL_ADDR) throw mkErr("Null pointer dereference", 0);
    const obj = heap[addr];
    if (!obj) return 0; // FIX: return 0 instead of throwing on invalid addr
    if (obj.__type==="struct") return field in obj ? obj[field] : 0;
    if (typeof field==="number" && obj.__data) return obj.__data[field]||0;
    return typeof obj==="number" ? obj : 0;
  }

  function heapSet(addr, field, val) {
    if (addr===NULL_ADDR) throw mkErr("Null pointer dereference", 0);
    if (!heap[addr] || typeof heap[addr] !== "object") {
      heap[addr] = {__type:"struct"};
    }
    if (heap[addr].__type==="raw" && typeof field !== "number") {
      heap[addr] = {__type:"struct"};
    }
    if (heap[addr].__type==="struct") { heap[addr][field]=val; return; }
    if (typeof field==="number" && heap[addr].__data) { heap[addr].__data[field]=val; return; }
    heap[addr] = val;
  }

  function fmtVal(v) {
    if (v===null||v===undefined) return "?";
    if (typeof v==="object"&&v.__type==="struct") {
      const fields=Object.entries(v).filter(([k])=>!k.startsWith("__"));
      return `{${fields.map(([k,vv])=>`${k}:${fmtVal(vv)}`).join(",")}}`;
    }
    if (Array.isArray(v)) return `[${v.slice(0,8).map(x=>typeof x==="number"&&x>31&&x<127?`'${String.fromCharCode(x)}'`:String(x)).join(",")}${v.length>8?"...":""}]`;
    if (typeof v==="string") return `"${v.slice(0,14).replace(/\n/g,"\\n")}${v.length>14?"...":""}"`;
    if (typeof v==="number") {
      if (v===NULL_ADDR) return "NULL";
      if (v>=256 && heap[v]) return `ptr(0x${v.toString(16)})`;
      return Number.isInteger(v)?String(v):v.toFixed(3);
    }
    return String(v);
  }

  function spf(fmt, args) {
    if (typeof fmt!=="string") return "";
    let out="", ai=0, i=0;
    while (i<fmt.length) {
      if (fmt[i]!=="%") { out+=fmt[i++]; continue; }
      i++;
      while ("-+ #0".includes(fmt[i]||"")) i++;
      let w=""; while(fmt[i]>="0"&&fmt[i]<="9") w+=fmt[i++];
      let p=""; if(fmt[i]==="."){i++;while(fmt[i]>="0"&&fmt[i]<="9")p+=fmt[i++];}
      if(fmt[i]==="l"||fmt[i]==="h") i++;
      const sp=fmt[i++];
      const val=args[ai++];
      const pad=(s)=>w&&s.length<parseInt(w)?s.padStart(parseInt(w)):s;
      if(sp==="d"||sp==="i") out+=pad(String(Math.trunc(Number(val)||0)));
      else if(sp==="f"||sp==="F") out+=pad((Number(val)||0).toFixed(p?parseInt(p):6));
      else if(sp==="g"||sp==="G"){ const n=Number(val)||0; out+=pad(parseFloat(n.toPrecision(p?parseInt(p):6)).toString()); }
      else if(sp==="e") out+=pad((Number(val)||0).toExponential(p?parseInt(p):6));
      else if(sp==="c") out+=typeof val==="number"?String.fromCharCode(val):"";
      else if(sp==="s") {
        if(Array.isArray(val)){let s="";for(const c of val){if(c===0)break;s+=String.fromCharCode(c);}out+=pad(s);}
        else out+=pad(String(val??"(null)"));
      }
      else if(sp==="x") out+=pad((Math.trunc(Number(val))||0).toString(16));
      else if(sp==="X") out+=pad((Math.trunc(Number(val))||0).toString(16).toUpperCase());
      else if(sp==="o") out+=pad((Math.trunc(Number(val))||0).toString(8));
      else if(sp==="p") out+=`0x${(Number(val)||0).toString(16)}`;
      else if(sp==="%") { out+="%"; ai--; }
      else out+="%"+sp;
    }
    return out;
  }

  // Unified lvalue system
  function lval(node) {
    const ln=node.line;
    if (node.kind==="Id") {
      return {
        read:()=>readVar(node.name,ln),
        write:(v)=>writeVar(node.name,v,ln),
        label:node.name,
      };
    }
    if (node.kind==="Idx") {
      return {
        read:()=>{
          const arr=evalE(node.arr), idx=evalE(node.idx);
          if(Array.isArray(arr)) return arr[idx]??0;
          if(typeof arr==="number"&&arr>=256) return heapGet(arr,idx);
          return 0;
        },
        write:(v)=>{
          const arr=evalE(node.arr), idx=evalE(node.idx);
          if(Array.isArray(arr)){arr[idx]=v;if(node.arr.kind==="Id")writeVar(node.arr.name,arr,ln);}
          else if(typeof arr==="number"&&arr>=256) heapSet(arr,idx,v);
        },
        label:()=>{
          const arr=node.arr.kind==="Id"?node.arr.name:"arr";
          return `${arr}[${evalE(node.idx)}]`;
        },
      };
    }
    if (node.kind==="Arrow") {
      const addr=evalE(node.obj);
      return {
        read:()=>heapGet(addr,node.field),
        write:(v)=>heapSet(addr,node.field,v),
        label:`ptr->` + node.field,
      };
    }
    if (node.kind==="Field") {
      return {
        read:()=>{
          const obj=evalE(node.obj);
          if(obj&&typeof obj==="object"&&obj.__type==="struct") return obj[node.field]??0;
          return 0;
        },
        write:(v)=>{
          const obj=evalE(node.obj);
          if(obj&&typeof obj==="object"&&obj.__type==="struct"){
            obj[node.field]=v;
            if(node.obj.kind==="Id") writeVar(node.obj.name,obj,ln);
          } else {
            snap(ln, `for #${++iter}: (no condition) -> loop`);
          }
        },
        label:`.`+node.field,
      };
    }
    if (node.kind==="Deref") {
      const addr=evalE(node.expr);
      return {
        read:()=>{ const v=heap[addr]; return typeof v==="number"?v:(v??0); },
        write:(v)=>{ heap[addr]=v; },
        label:`*ptr`,
      };
    }
    return {read:()=>evalE(node), write:()=>{}, label:"?"};
  }

  function evalE(node) {
    if (!node) return 0;
    const ln=node.line;
    lastNode = node; lastLine = ln;
    switch(node.kind) {
      case "Num": return node.v;
      case "Str": return node.v;
      case "Id": return readVar(node.name, ln);
      case "Bin": {
        switch(node.op) {
          case "&&": {
            const l = evalE(node.l);
            if (!l) return 0;
            const r = evalE(node.r);
            return (l && r) ? 1 : 0;
          }
          case "||": {
            const l = evalE(node.l);
            if (l) return 1;
            const r = evalE(node.r);
            return (l || r) ? 1 : 0;
          }
          default: {
            const l=evalE(node.l), r=evalE(node.r);
            switch(node.op) {
              case "+": return (typeof l==="string"||typeof r==="string")?String(l)+String(r):l+r;
              case "-": return l-r; case "*": return l*r;
              case "/": if(r===0) throw mkErr("Division by zero",ln); return (Number.isInteger(l)&&Number.isInteger(r))?Math.trunc(l/r):l/r;
              case "%": if(r===0) return 0; return ((l%r)+Math.abs(r))%Math.abs(r);
              case "==": return l===r?1:0; case "!=": return l!==r?1:0;
              case "<": return l<r?1:0; case ">": return l>r?1:0;
              case "<=": return l<=r?1:0; case ">=": return l>=r?1:0;
              case "LSHIFT": return l<<r; case "RSHIFT": return l>>r;
              default: return 0;
            }
          }
        }
      }
      case "Unary": {
        const v=evalE(node.expr);
        return node.op==="-"?-v:node.op==="!"?(v?0:1):node.op==="~"?~v:v;
      }
      case "Sizeof": {
        const v = evalE(node.expr);
        if (Array.isArray(v)) return v.length * 4;
        if (typeof v === "string") return v.length;
        return 4;
      }
      case "Tern": return evalE(node.c)?evalE(node.th):evalE(node.el);
      case "Idx": {
        const arr=evalE(node.arr), idx=evalE(node.idx);
        if(Array.isArray(arr)) return arr[idx]!==undefined?arr[idx]:0;
        if(typeof arr==="string") return arr.charCodeAt(idx);
        if(typeof arr==="number"&&arr>=256) return heapGet(arr,idx);
        return 0;
      }
      case "Field": {
        const obj=evalE(node.obj);
        if(obj&&typeof obj==="object"&&obj.__type==="struct") return obj[node.field]??0;
        return 0;
      }
      case "Arrow": {
        const addr=evalE(node.obj);
        if(addr===NULL_ADDR) throw mkErr("Null pointer dereference (->)", ln);
        return heapGet(addr, node.field);
      }
      case "AddrOf": {
        if(node.expr.kind==="Id") {
          const val=readVar(node.expr.name,ln);
          const addr=heapNext; heapNext+=8;
          heap[addr]=val;
          return addr;
        }
        return NULL_ADDR;
      }
      case "Deref": {
        const addr=evalE(node.expr);
        if(addr===NULL_ADDR) throw mkErr("Null pointer dereference (*)", ln);
        const v=heap[addr];
        return (v!==undefined&&typeof v!=="object")?v:(typeof v==="object"?v:0);
      }
      case "PreInc": {
        const lv=lval(node.expr);
        const cur=Number(lv.read())||0;
        const nv=node.op==="++"?cur+1:cur-1;
        lv.write(nv);
        snap(ln, `${node.op}${typeof lv.label==="function"?lv.label():lv.label} -> ${nv}`);
        return nv;
      }
      case "PostInc": {
        const lv=lval(node.expr);
        const cur=Number(lv.read())||0;
        const nv=node.op==="++"?cur+1:cur-1;
        lv.write(nv);
        snap(ln, `${typeof lv.label==="function"?lv.label():lv.label}${node.op}: ${cur}->${nv}`);
        return cur;
      }
      case "Assign": {
        const rval=evalE(node.right);
        const lv=lval(node.left);
        const cur=Number(lv.read())||0;
        const nv=node.op==="="?rval:node.op==="+="?cur+rval:node.op==="-="?cur-rval:node.op==="*="?cur*rval:node.op==="/="?(rval?Math.trunc(cur/rval):0):node.op==="%="?cur%rval:rval;
        lv.write(nv);
        const lbl=typeof lv.label==="function"?lv.label():lv.label;
        snap(ln, `${lbl} ${node.op} ${fmtVal(rval)} -> ${fmtVal(nv)}`);
        return nv;
      }
      case "Call": {
        const fname=node.fn.kind==="Id"?node.fn.name:"";
        // scanf handled BEFORE argVals pre-evaluation to prevent phantom heap allocations
        // from evalE(&x) creating spurious heap entries and corrupting heapNext for malloc
        if(fname==="scanf") {
          const fmt=node.args[0]?evalE(node.args[0]):"";
          const fmtStr=typeof fmt==="string"?fmt:"";
          const specs=[...fmtStr.matchAll(/%[diouxXfgecs]/g)];
          for(let si=0;si<specs.length;si++){
            const arg=node.args[si+1];
            const raw = stdinTokPos < stdinTokens.length ? stdinTokens[stdinTokPos++] : "0";
            const spec=specs[si][0];
            const val=spec==="%c"?raw.charCodeAt(0):spec==="%s"?raw:(parseFloat(raw)||0);
            let written=false;
            if(arg&&arg.kind==="AddrOf") {
              try {
                const lv = lval(arg.expr);
                lv.write(val);
                const label = typeof lv.label === "function" ? lv.label() : lv.label;
                snap(ln, `scanf -> ${label} = ${fmtVal(val)}`);
                written=true;
              } catch(e) {
                if(arg.expr.kind==="Id") {
                  if(curFrame()) curFrame().locals[arg.expr.name]=val;
                  else globals[arg.expr.name]=val;
                  snap(ln, `scanf -> ${arg.expr.name} = ${fmtVal(val)}`);
                  written=true;
                }
              }
            }
            if(!written&&arg) {
              try {
                const lv=lval(arg);
                lv.write(val);
                const label=typeof lv.label==="function"?lv.label():lv.label;
                snap(ln, `scanf -> ${label} = ${fmtVal(val)}`);
              } catch(e) { snap(ln, `scanf -> (arg) = ${fmtVal(val)}`); }
            }
          }
          return specs.length;
        }
        const argVals=node.args.map(a=>evalE(a));

        if(fname==="printf"||fname==="fprintf") {
          const off=fname==="fprintf"?1:0;
          const fmt=argVals[off]; const rest=argVals.slice(off+1);
          const out=typeof fmt==="string"?spf(fmt,rest):"";
          stdout+=out;
          snap(ln, `printf -> "${out.replace(/\n/g,"\\n").slice(0,60)}"`);
          return out.length;
        }
        if(fname==="malloc"||fname==="calloc") {
          const size=fname==="calloc"?(argVals[0]||1)*(argVals[1]||4):(argVals[0]||4);
          const addr=heapNext; heapNext+=Math.max(size,8);
          heap[addr]={__type:"raw",__size:size,__data:new Array(Math.min(size,256)).fill(0)};
          snap(ln, `malloc(${size}) -> 0x${addr.toString(16)}`);
          return addr;
        }
        if(fname==="free"){ snap(ln,`free(0x${(argVals[0]||0).toString(16)})`); return 0; }
        if(fname==="putchar"){const ch=String.fromCharCode(argVals[0]||0);stdout+=ch;snap(ln,`putchar('${ch==="\n"?"\\n":ch}')`);return argVals[0]||0;}
        if(fname==="puts"){stdout+=String(argVals[0]||"")+"\n";snap(ln,`puts("${String(argVals[0]||"").replace(/\n/g,"\\n")}")`);return 0;}
        if(fname==="getchar"){const c=stdinLines[stdinPos]?.[0]||"\n";snap(ln,`getchar -> '${c}'`);return c.charCodeAt(0);}
        if(fname==="abs"||fname==="fabs") return Math.abs(argVals[0]);
        if(fname==="sqrt") return Math.sqrt(argVals[0]);
        if(fname==="pow") return Math.pow(argVals[0],argVals[1]);
        if(fname==="floor") return Math.floor(argVals[0]);
        if(fname==="ceil") return Math.ceil(argVals[0]);
        if(fname==="round") return Math.round(argVals[0]);
        if(fname==="strlen"){const s=argVals[0];if(Array.isArray(s)){const z=s.indexOf(0);return z===-1?s.length:z;}return typeof s==="string"?s.length:0;}
        if(fname==="strcpy"||fname==="strncpy") return argVals[0];
        if(fname==="strcmp"||fname==="strncmp"){const a=String(argVals[0]),b=String(argVals[1]);return a<b?-1:a>b?1:0;}
        if(fname==="rand") return Math.floor(Math.random()*32767);
        if(fname==="srand"||fname==="exit") return 0;
        if(fname==="atoi") return parseInt(String(argVals[0]))||0;
        if(fname==="atof") return parseFloat(String(argVals[0]))||0;
        if(fname==="max"||fname==="fmax") return Math.max(argVals[0],argVals[1]);
        if(fname==="min"||fname==="fmin") return Math.min(argVals[0],argVals[1]);

        const fn=functions[fname];
        if(!fn){ snap(ln,`call ${fname}() [unknown]`); return 0; }
        const frame={name:fname, locals:{}, addrs:{}, stackPtr:STACK_BASE - callStack.length*0x400};
        fn.params.forEach((p,idx)=>{ frame.locals[p.name]=argVals[idx]!==undefined?argVals[idx]:0; });
        callStack.push(frame);
        snap(ln, `call ${fname}(${argVals.map(fmtVal).join(", ")})`);
        let ret=0;
        try {
          const r=execBlock(fn.body);
          if(r&&r._sig==="return") ret=r.v!==undefined?r.v:0;
        } finally {
          callStack.pop();
          snap(ln, `return from ${fname} -> ${fmtVal(ret)}`);
        }
        return ret;
      }
      default: return 0;
    }
  }

  function execStmt(node) {
    if(!node) return;
    const ln=node.line;
    lastNode = node; lastLine = ln;
    switch(node.kind){
      case "Block": return execBlock(node);
      case "VDecl": {
        const val=node.init?evalE(node.init):0;
        if(callStack.length > 0) {
          const fr=curFrame();
          fr.addrs[node.name]=fr.stackPtr;
          fr.stackPtr += sizeOf(node.type, node.isPtr);
          fr.locals[node.name]=val;
        } else globals[node.name]=val;
        snap(ln, `declare ${node.name} = ${fmtVal(val)}`);
        return;
      }
      case "MDecl": {
        for(const d of node.decls) {
          const v = d.init?evalE(d.init):0;
          if(callStack.length > 0) {
            const fr=curFrame();
            fr.addrs[d.name]=fr.stackPtr;
            fr.stackPtr += sizeOf(node.type, d.isPtr);
            fr.locals[d.name]=v;
          } else globals[d.name]=v;
        }
        snap(ln, `declare ${node.decls.map(d=>`${d.name}`).join(", ")}`);
        return;
      }
      case "ArrDecl": {
        let arr;
        if(node.init&&node.init.kind==="ArrLit") arr=node.init.els.map(e=>evalE(e));
        else if(node.init&&node.init.kind==="Str"){arr=[...node.init.v].map(c=>c.charCodeAt(0));arr.push(0);}
        else if(node.init){const v=evalE(node.init);arr=typeof v==="string"?[...v].map(c=>c.charCodeAt(0)).concat([0]):[v];}
        else{const sz=node.sz?Math.min(evalE(node.sz),512):10;arr=new Array(sz).fill(0);}
        if(callStack.length > 0) {
          const fr=curFrame();
          fr.addrs[node.name]=fr.stackPtr;
          fr.stackPtr += sizeOf(node.type, false) * arr.length;
          fr.locals[node.name]=arr;
        } else globals[node.name]=arr;
        snap(ln, `declare ${node.name}[${arr.length}]`);
        return;
      }
      case "Estmt": evalE(node.expr); return;
      case "If": {
        const cond=evalE(node.cond);
        snap(ln, `if (${fmtVal(cond)}) -> ${cond?"true ok":"false x"}`);
        if(cond){const r=execStmt(node.then);if(r)return r;}
        else if(node.els){const r=execStmt(node.els);if(r)return r;}
        return;
      }
      case "While": {
        let iter=0;
        while(true){
          const cond=evalE(node.cond);
          snap(ln, `while #${++iter}: (${fmtVal(cond)}) -> ${cond?"loop ->":"exit x"}`);
          if(!cond) break;
          const r=execStmt(node.body);
          if(r&&r._sig==="break") break;
          if(r&&r._sig==="return") return r;
        }
        return;
      }
      case "For": {
        if(node.init){if(node.init.kind==="VDecl")execStmt(node.init);else evalE(node.init);}
        let iter=0;
        while(true){
          if(node.cond){
            const cond=evalE(node.cond);
            snap(ln, `for #${++iter}: (${fmtVal(cond)}) -> ${cond?"loop ->":"exit x"}`);
            if(!cond) break;
          }
          const r=execStmt(node.body);
          if(r&&r._sig==="break") break;
          if(r&&r._sig==="return") return r;
          if(node.upd) evalE(node.upd);
        }
        return;
      }
      case "DoWhile": {
        let iter=0;
        do{
          const r=execStmt(node.body);
          if(r&&r._sig==="break") break;
          if(r&&r._sig==="return") return r;
          const cond=evalE(node.cond);
          snap(ln, `do-while #${++iter}: -> ${cond?"repeat ->":"exit x"}`);
          if(!cond) break;
        }while(true);
        return;
      }
      case "Switch": {
        const val=evalE(node.cond);
        snap(ln, `switch (${fmtVal(val)})`);
        let matched=false;
        for(const c of (node.cases||[])){
          if(!matched && evalE(c.val)===val) matched=true;
          if(matched){ for(const s of c.body){const r=execStmt(s);if(r&&r._sig==="break")return;if(r)return r;} }
        }
        if(!matched && node.def){ for(const s of node.def){const r=execStmt(s);if(r&&r._sig==="break")return;if(r)return r;} }
        return;
      }
      case "Return": {
        const val=node.val?evalE(node.val):undefined;
        snap(ln, `return ${val!==undefined?fmtVal(val):"void"}`);
        return {_sig:"return",v:val};
      }
      case "Break": snap(ln,"break"); return {_sig:"break"};
      case "Cont": snap(ln,"continue"); return {_sig:"cont"};
      default: return;
    }
  }

  function execBlock(block){
    for(const s of block.stmts){
      try {
        const r=execStmt(s);
        if(r&&r._sig) return r;
      } catch(e) {
        throw wrapError(e);
      }
    }
  }

  // FIX: Register structs and functions first, then globals (avoids eval order issues)
  for(const node of ast.body){
    if(node.kind==="StructDef") structs[node.name]=node.fields||[];
    if(node.kind==="TypedefStruct"){
      if(node.fields) structs[node.sname]=node.fields;
      if(node.tname!==node.sname) structs[node.tname]=structs[node.sname]||[];
    }
    if(node.kind==="FDef") functions[node.name]=node;
    if(node.kind==="FDecl") {} // just a declaration, skip
  }
  // Now evaluate globals (after structs/functions are known)
  for(const node of ast.body){
    if(node.kind==="GVar") { try{globals[node.name]=node.init?evalE(node.init):0;}catch(e){globals[node.name]=0;} }
    if(node.kind==="GArr"){
      if(node.init&&node.init.kind==="ArrLit") globals[node.name]=node.init.els.map(e=>evalE(e));
      else{const sz=node.sz?Math.min(evalE(node.sz),512):10;globals[node.name]=new Array(sz).fill(0);}
    }
  }

  const mainFn=functions["main"];
  if(!mainFn) throw mkErr("No main() function found",1);
  callStack.push({name:"main",locals:{},addrs:{},stackPtr:STACK_BASE});
  let _interpErr=null;
  try { execBlock(mainFn.body); } catch(e) { if(!e._sig) _interpErr=wrapError(e); }
  callStack.pop();
  if(_interpErr) return {steps, error:_interpErr.message||String(_interpErr)};
  return {steps, error:null};
}

function preprocessCode(code) {
  return (code || "").replace(/^\s*#define\s+(\w+)\s+([^\r\n]+)\s*$/gm, "const int $1 = $2;");
}

function collectIds(node, out = new Set()) {
  if (!node || typeof node !== "object") return out;
  if (node.kind === "Id" && node.name) out.add(node.name);
  for (const k in node) {
    const v = node[k];
    if (v && typeof v === "object") {
      if (Array.isArray(v)) v.forEach(n => collectIds(n, out));
      else collectIds(v, out);
    }
  }
  return out;
}

function analyzeComplexity(ast) {
  let maxDepth = 0;
  const loopVars = [];
  let hasArray = false;
  let hasHeap = false;

  function walkStmt(node, depth = 0) {
    if (!node || typeof node !== "object") return;
    if (node.kind === "ArrDecl" || node.kind === "GArr") hasArray = true;
    if (node.kind === "Call" && node.fn && node.fn.kind === "Id" && node.fn.name === "malloc") hasHeap = true;
    if (node.kind === "For" || node.kind === "While" || node.kind === "DoWhile") {
      const cond = node.cond || node;
      const ids = Array.from(collectIds(cond));
      if (ids.length) loopVars.push(ids[0]);
      const d = depth + 1;
      if (d > maxDepth) maxDepth = d;
      if (node.body) walkStmt(node.body, d);
      if (node.then) walkStmt(node.then, d);
      if (node.els) walkStmt(node.els, d);
      if (node.stmts) node.stmts.forEach(s => walkStmt(s, d));
      return;
    }
    if (node.stmts) node.stmts.forEach(s => walkStmt(s, depth));
    if (node.then) walkStmt(node.then, depth);
    if (node.els) walkStmt(node.els, depth);
    if (node.body) walkStmt(node.body, depth);
  }

  if (ast && ast.body) ast.body.forEach(n => walkStmt(n, 0));
  const nVar = loopVars.find(v => v === "n") || loopVars[0];
  const time = maxDepth === 0 ? "O(1)" : `O(${nVar || "n"}${maxDepth > 1 ? "^" + maxDepth : ""})`;
  const space = hasArray || hasHeap ? "O(n)" : "O(1)";
  return { time, space, maxDepth, loopVar: nVar || "n" };
}

function analyzeStructures(ast) {
  const structs = [];
  const listStructs = [];
  const treeStructs = [];
  const avlStructs = [];

  if (ast && ast.body) {
    for (const n of ast.body) {
      if (n.kind === "StructDef") {
        const fields = (n.fields || []).map(f => f.name);
        structs.push({ name: n.name, fields });
        const hasNext = fields.includes("next") || fields.includes("nxt") || fields.includes("link");
        const hasLeft = fields.includes("left") || fields.includes("l") || fields.includes("lchild") || fields.includes("leftChild");
        const hasRight = fields.includes("right") || fields.includes("r") || fields.includes("rchild") || fields.includes("rightChild");
        const hasHeight = fields.includes("height");
        if (hasNext) listStructs.push(n.name);
        if (hasLeft || hasRight) treeStructs.push(n.name);
        if ((hasLeft || hasRight) && hasHeight) avlStructs.push(n.name);
      }
      if (n.kind === "TypedefStruct") {
        const fields = (n.fields || []).map(f => f.name);
        structs.push({ name: n.tname, fields });
        const hasNext = fields.includes("next") || fields.includes("nxt") || fields.includes("link");
        const hasLeft = fields.includes("left") || fields.includes("l") || fields.includes("lchild") || fields.includes("leftChild");
        const hasRight = fields.includes("right") || fields.includes("r") || fields.includes("rchild") || fields.includes("rightChild");
        const hasHeight = fields.includes("height");
        if (hasNext) listStructs.push(n.tname);
        if (hasLeft || hasRight) treeStructs.push(n.tname);
        if ((hasLeft || hasRight) && hasHeight) avlStructs.push(n.tname);
      }
    }
  }

  return {
    structs,
    linkedList: Array.from(new Set(listStructs)),
    binaryTree: Array.from(new Set(treeStructs)),
    avlTree: Array.from(new Set(avlStructs)),
  };
}

function analyzeCode(code) {
  try {
    const src = preprocessCode(code);
    const tokens = tokenize(src);
    const ast = parse(tokens);
    return {
      ok: true,
      structures: analyzeStructures(ast),
      complexity: analyzeComplexity(ast),
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function runInterpreter(code, stdin) {
  try {
    const src = preprocessCode(code);
    const tokens=tokenize(src);
    const ast=parse(tokens);
    const result=interpret(ast,stdin);
    return {steps:result.steps, error:result.error};
  } catch(e) {
    const trace = e._trace || {};
    const line = trace.line || e.cline || 0;
    const node = trace.node ? `${trace.node.kind}` : "unknown";
    const stmt = trace.node ? JSON.stringify(trace.node) : "";
    const state = trace.state ? JSON.stringify({globals: trace.state.globals, stack: trace.state.stack}) : "";
    const stack = trace.stack ? String(trace.stack).split("\n").slice(0,5).join("\n") : "";
    const msg = e.message + (line?` (line ${line})`:"") + `\nNode: ${node}` + (stmt?`\nStatement: ${stmt}`:"") + (state?`\nState: ${state}`:"") + (stack?`\nStack:\n${stack}`:"");
    return {steps:[], error:msg}; 
  }
}

self.onmessage = (e) => {
  const data = e.data || {};
  const code = data.code || "";
  const stdin = data.stdin || "";
  const runId = data.runId;
  try {
    const result = runInterpreter(code, stdin);
    self.postMessage(Object.assign({}, result, { runId }));
  } catch (err) {
    self.postMessage({ steps: [], error: (err && err.message) ? err.message : "Interpreter error", runId });
  }
};