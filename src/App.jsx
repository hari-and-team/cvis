import { useState, useRef, useEffect, useCallback } from "react";
import { Play, Terminal, Code2, Loader2, Copy, Check, FileText, Keyboard, Eye, ChevronLeft, ChevronRight, Cpu, AlertTriangle, SkipBack, SkipForward, ListTree } from "lucide-react";

// ─── THEME ───
const TH = {
  bgDeep:"#0a0e1a", bgCard:"#0f1629", bgRaised:"#161e35",
  border:"#1e2d4a", dimText:"#4a6080", midText:"#7a95b8",
  bright:"#c8daf4", white:"#eef4ff", accent:"#4f46e5",
  green:"#22d3a5", orange:"#f59e0b", red:"#f43f5e", purple:"#a78bfa",
};

const ctrlBtnStyle = {
  display:"flex", alignItems:"center", justifyContent:"center", gap:4,
  padding:"7px 10px", background:TH.bgRaised, border:`1px solid ${TH.border}`,
  borderRadius:7, color:TH.midText, fontSize:11, fontWeight:700,
  cursor:"pointer", letterSpacing:0.5,
};

// ═══════════════════════
//  TOKENIZER
// ═══════════════════════
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

// ════════════════════════════════════════════════════════════
//  PARSER
// ════════════════════════════════════════════════════════════
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
    // FIX: Cast detection — use isTypeAt(1) instead of broken isType.call(null, peek(1))
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

// ════════════════════════════════════════════════════════════
//  INTERPRETER
// ════════════════════════════════════════════════════════════
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
    if (++stepCount > STEP_LIMIT) throw mkErr("Step limit — possible infinite loop", line);
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
    // FIX: Return 0 for unknown vars instead of throwing — avoids crashes on forward refs / undeclared
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
    if (Array.isArray(v)) return `[${v.slice(0,8).map(x=>typeof x==="number"&&x>31&&x<127?`'${String.fromCharCode(x)}'`:String(x)).join(",")}${v.length>8?"…":""}]`;
    if (typeof v==="string") return `"${v.slice(0,14).replace(/\n/g,"\\n")}${v.length>14?"…":""}"`;
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
        snap(ln, `${node.op}${typeof lv.label==="function"?lv.label():lv.label} → ${nv}`);
        return nv;
      }
      case "PostInc": {
        const lv=lval(node.expr);
        const cur=Number(lv.read())||0;
        const nv=node.op==="++"?cur+1:cur-1;
        lv.write(nv);
        snap(ln, `${typeof lv.label==="function"?lv.label():lv.label}${node.op}: ${cur}→${nv}`);
        return cur;
      }
      case "Assign": {
        const rval=evalE(node.right);
        const lv=lval(node.left);
        const cur=Number(lv.read())||0;
        const nv=node.op==="="?rval:node.op==="+="?cur+rval:node.op==="-="?cur-rval:node.op==="*="?cur*rval:node.op==="/="?(rval?Math.trunc(cur/rval):0):node.op==="%="?cur%rval:rval;
        lv.write(nv);
        const lbl=typeof lv.label==="function"?lv.label():lv.label;
        snap(ln, `${lbl} ${node.op} ${fmtVal(rval)} → ${fmtVal(nv)}`);
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
                snap(ln, `scanf → ${label} = ${fmtVal(val)}`);
                written=true;
              } catch(e) {
                if(arg.expr.kind==="Id") {
                  if(curFrame()) curFrame().locals[arg.expr.name]=val;
                  else globals[arg.expr.name]=val;
                  snap(ln, `scanf → ${arg.expr.name} = ${fmtVal(val)}`);
                  written=true;
                }
              }
            }
            if(!written&&arg) {
              try {
                const lv=lval(arg);
                lv.write(val);
                const label=typeof lv.label==="function"?lv.label():lv.label;
                snap(ln, `scanf → ${label} = ${fmtVal(val)}`);
              } catch(e) { snap(ln, `scanf → (arg) = ${fmtVal(val)}`); }
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
          snap(ln, `printf → "${out.replace(/\n/g,"\\n").slice(0,60)}"`);
          return out.length;
        }
        if(fname==="malloc"||fname==="calloc") {
          const size=fname==="calloc"?(argVals[0]||1)*(argVals[1]||4):(argVals[0]||4);
          const addr=heapNext; heapNext+=Math.max(size,8);
          heap[addr]={__type:"raw",__size:size,__data:new Array(Math.min(size,256)).fill(0)};
          snap(ln, `malloc(${size}) → 0x${addr.toString(16)}`);
          return addr;
        }
        if(fname==="free"){ snap(ln,`free(0x${(argVals[0]||0).toString(16)})`); return 0; }
        if(fname==="putchar"){const ch=String.fromCharCode(argVals[0]||0);stdout+=ch;snap(ln,`putchar('${ch==="\n"?"\\n":ch}')`);return argVals[0]||0;}
        if(fname==="puts"){stdout+=String(argVals[0]||"")+"\n";snap(ln,`puts("${String(argVals[0]||"").replace(/\n/g,"\\n")}")`);return 0;}
        if(fname==="getchar"){const c=stdinLines[stdinPos]?.[0]||"\n";snap(ln,`getchar → '${c}'`);return c.charCodeAt(0);}
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
          snap(ln, `return from ${fname} → ${fmtVal(ret)}`);
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
        snap(ln, `if (${fmtVal(cond)}) → ${cond?"true ✓":"false ✗"}`);
        if(cond){const r=execStmt(node.then);if(r)return r;}
        else if(node.els){const r=execStmt(node.els);if(r)return r;}
        return;
      }
      case "While": {
        let iter=0;
        while(true){
          const cond=evalE(node.cond);
          snap(ln, `while #${++iter}: (${fmtVal(cond)}) → ${cond?"loop ↺":"exit ✗"}`);
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
            snap(ln, `for #${++iter}: (${fmtVal(cond)}) → ${cond?"loop ↺":"exit ✗"}`);
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
          snap(ln, `do-while #${++iter}: → ${cond?"repeat ↺":"exit ✗"}`);
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
    const state = trace.state ? JSON.stringify({globals: trace.state.globals, stack: trace.state.stack}) : "";
    const stack = trace.stack ? String(trace.stack).split("\n").slice(0,5).join("\n") : "";
    const msg = e.message + (line?` (line ${line})`:"") + `\nNode: ${node}` + (state?`\nState: ${state}`:"") + (stack?`\nStack:\n${stack}`:"");
    return {steps:[], error:msg};
  }
}

function createTraceWorker() {
  if (typeof Worker === "undefined") return null;
    const workerSrc = [
    "const TWO_CHAR_OPS = " + JSON.stringify(TWO_CHAR_OPS) + ";",
    "const STEP_LIMIT = " + STEP_LIMIT + ";",
    "const NULL_ADDR = " + NULL_ADDR + ";",
    preprocessCode.toString(),
    tokenize.toString(),
    parse.toString(),
    interpret.toString(),
    runInterpreter.toString(),
    "self.onmessage = (e) => {",
    "  const data = e.data || {};",
    "  const code = data.code || \"\";",
    "  const stdin = data.stdin || \"\";",
    "  const runId = data.runId;",
    "  try {",
    "    const result = runInterpreter(code, stdin);",
    "    self.postMessage(Object.assign({}, result, { runId }));",
    "  } catch (err) {",
    "    self.postMessage({ steps: [], error: (err && err.message) ? err.message : \"Interpreter error\", runId });",
    "  }",
    "};",
  ].join("\n");
  const blob = new Blob([workerSrc], { type: "text/javascript" });
  const url = URL.createObjectURL(blob);
  const worker = new Worker(url);
  return { worker, url };
}

// ════════════════════════════════════════════════════════════
//  SYNTAX HIGHLIGHTER
// ════════════════════════════════════════════════════════════
function highlight(code) {
  if (!code) return "";
  let s = code.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const ph=[]; let pi=0;
  const add=(html)=>{ ph.push(html); return `\x00${pi++}\x00`; };
  s=s.replace(/(\/\*[\s\S]*?\*\/|\/\/[^\n]*)/g, m=>add(`<span style="color:#22c55e;font-style:italic">${m}</span>`));
  s=s.replace(/(#[^\n]*)/g, m=>add(`<span style="color:#a78bfa">${m}</span>`));
  s=s.replace(/("(?:[^"\\]|\\.)*")/g, m=>add(`<span style="color:#fde68a">${m}</span>`));
  s=s.replace(/\b(\d+(?:\.\d+)?)\b/g, m=>add(`<span style="color:#fb923c">${m}</span>`));
  s=s.replace(/\b(int|float|double|char|void|return|if|else|while|for|do|switch|case|break|continue|struct|typedef|sizeof|long|short|unsigned|signed|const|static|NULL)\b/g,
    m=>add(`<span style="color:#f472b6;font-weight:600">${m}</span>`));
  s=s.replace(/\b(printf|scanf|fprintf|putchar|puts|malloc|calloc|free|abs|sqrt|strlen|pow|rand|atoi|strcmp|strcpy|strcat)\b/g,
    m=>add(`<span style="color:#38bdf8">${m}</span>`));
  s=s.replace(/\b([a-zA-Z_]\w*)\s*(?=\()/g, m=>add(`<span style="color:#60a5fa">${m}</span>`));
  for (let i=0; i<pi; i++) s=s.replace(`\x00${i}\x00`, ph[i]);
  return s+"\n";
}

// ════════════════════════════════════════════════════════════
//  VISUALIZER COMPONENTS
// ════════════════════════════════════════════════════════════
function VarCell({name, val, changed, addr}){
  const isArr=Array.isArray(val);
  const isStruct=val&&typeof val==="object"&&val.__type==="struct";
  const isPtr=!isArr&&!isStruct&&typeof val==="number"&&val>=256&&val<0x10000;
  const disp=isArr?`[${val.length}]`
    :isStruct?"struct"
    :typeof val==="number"?(isPtr?`→0x${val.toString(16)}`:(val===0&&isPtr?"NULL":(Number.isInteger(val)?String(val):val.toFixed(3))))
    :typeof val==="string"?`"${val.slice(0,10)}${val.length>10?"…":""}"`:"?";

  return(
    <div style={{background:changed?`${TH.accent}1a`:TH.bgRaised,border:`1px solid ${changed?TH.accent:TH.border}`,borderRadius:8,padding:isArr||isStruct?"8px":"9px 11px",transition:"all 0.25s",boxShadow:changed?`0 0 10px ${TH.accent}28`:"none",gridColumn:(isArr||isStruct)?"1/-1":"auto"}}>
      <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:isArr||isStruct?6:3}}>
        <span style={{color:isPtr?TH.purple:isArr?TH.orange:isStruct?"#06b6d4":changed?"#818cf8":TH.midText,fontSize:10,fontWeight:700,letterSpacing:1,textTransform:"uppercase",fontFamily:"monospace"}}>{name}</span>
        {isPtr&&<span style={{fontSize:9,color:TH.purple,background:`${TH.purple}20`,padding:"1px 4px",borderRadius:3}}>PTR</span>}
        {isArr&&<span style={{fontSize:9,color:TH.orange,background:`${TH.orange}20`,padding:"1px 4px",borderRadius:3}}>ARR</span>}
        {isStruct&&<span style={{fontSize:9,color:"#06b6d4",background:"#06b6d420",padding:"1px 4px",borderRadius:3}}>STRUCT</span>}
        {changed&&!isArr&&!isStruct&&<span style={{width:5,height:5,borderRadius:"50%",background:TH.accent,display:"inline-block",marginLeft:"auto"}}/>}
      </div>
      {addr!==undefined&&<div style={{color:TH.dimText,fontSize:9,fontFamily:"monospace",marginBottom:3}}>0x{addr.toString(16)}</div>}
      {isArr&&(
        <div style={{display:"flex",flexWrap:"wrap",gap:3}}>
          {val.map((v,i)=>(
            <div key={i} style={{background:TH.bgDeep,border:`1px solid ${TH.border}`,borderRadius:4,padding:"2px 5px",fontSize:11,fontFamily:"monospace",color:TH.bright,textAlign:"center",minWidth:26}}>
              <div style={{color:TH.dimText,fontSize:9}}>[{i}]</div>
              <div>{v>31&&v<127?`'${String.fromCharCode(v)}'`:v}</div>
            </div>
          ))}
        </div>
      )}
      {isStruct&&(
        <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
          {Object.entries(val).filter(([k])=>!k.startsWith("__")).map(([k,v])=>(
            <div key={k} style={{background:TH.bgDeep,border:`1px solid ${TH.border}`,borderRadius:4,padding:"3px 7px",fontSize:11,fontFamily:"monospace",color:TH.bright}}>
              <span style={{color:TH.dimText}}>{k}: </span>
              <span style={{color:typeof v==="number"&&v>=256?TH.purple:TH.bright}}>
                {typeof v==="number"&&v>=256?`→0x${v.toString(16)}`:String(v)}
              </span>
            </div>
          ))}
        </div>
      )}
      {!isArr&&!isStruct&&(
        <div style={{color:isPtr?TH.purple:changed?TH.white:TH.bright,fontSize:isPtr?13:19,fontWeight:800,fontFamily:"monospace"}}>{disp}</div>
      )}
    </div>
  );
}

function HeapCard({addr, obj, prevObj}){
  const changed=JSON.stringify(prevObj)!==JSON.stringify(obj);
  const isStruct=obj&&obj.__type==="struct";
  const fields=isStruct?Object.entries(obj).filter(([k])=>!k.startsWith("__")):[];
  return(
    <div style={{background:changed?`${TH.purple}12`:TH.bgRaised,border:`1px solid ${changed?TH.purple:TH.border}`,borderRadius:8,padding:10,minWidth:130,transition:"all 0.3s"}}>
      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:7}}>
        <span style={{color:TH.dimText,fontSize:9,fontFamily:"monospace"}}>0x{parseInt(addr).toString(16)}</span>
        {isStruct&&<span style={{fontSize:9,color:"#06b6d4",background:"#06b6d418",padding:"1px 5px",borderRadius:3}}>{obj.__sname||"struct"}</span>}
      </div>
      {fields.map(([k,v])=>(
        <div key={k} style={{display:"flex",justifyContent:"space-between",gap:8,fontSize:11,fontFamily:"monospace",marginBottom:3}}>
          <span style={{color:TH.midText}}>{k}</span>
          <span style={{color:typeof v==="number"&&v>=256?TH.purple:v===0?TH.dimText:TH.bright,fontWeight:700}}>
            {typeof v==="number"&&v>=256?`→0x${v.toString(16)}`:v===0?"NULL":String(v)}
          </span>
        </div>
      ))}
      {!isStruct&&<div style={{color:TH.orange,fontSize:12,fontFamily:"monospace"}}>raw block</div>}
    </div>
  );
}

function nodeValueFromStruct(obj){
  if(!obj||typeof obj!=="object") return "?";
  if("data" in obj) return obj.data;
  if("val" in obj) return obj.val;
  if("key" in obj) return obj.key;
  const fields=Object.entries(obj).filter(([k])=>!k.startsWith("__"));
  for(const [,v] of fields){
    if(typeof v==="number"){
      if(v>=256) continue;
      return v;
    }
    if(typeof v==="string") return v;
  }
  return "?";
}

function LinkedListViz({lists}){
  if(!lists.length) return null;
  return(
    <div style={{marginBottom:12}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
        <span style={{color:TH.dimText,fontSize:10,fontWeight:700,letterSpacing:2,textTransform:"uppercase"}}>Linked List</span>
        <div style={{flex:1,height:1,background:TH.border}}/>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {lists.map((nodes,li)=>(
          <div key={li} style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            {nodes.map((n,idx)=>(
              <div key={n.addr} style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{width:44,height:44,borderRadius:"50%",background:TH.bgRaised,border:`2px solid ${TH.accent}`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"monospace",fontWeight:800,color:TH.white}}>
                  {n.value}
                </div>
                {idx<nodes.length-1&&<span style={{color:TH.accent,fontSize:16,fontWeight:800}}>→</span>}
              </div>
            ))}
            <span style={{color:TH.dimText,fontSize:11,fontFamily:"monospace"}}>NULL</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StackViz({items}){
  if(!items.length) return null;
  return(
    <div style={{marginBottom:12}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
        <span style={{color:TH.dimText,fontSize:10,fontWeight:700,letterSpacing:2,textTransform:"uppercase"}}>Stack</span>
        <div style={{flex:1,height:1,background:TH.border}}/>
      </div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
        {items.map((v,i)=>(
          <div key={i} style={{minWidth:46,padding:"6px 8px",background:TH.bgRaised,border:`1px solid ${TH.border}`,borderRadius:6,color:TH.white,fontFamily:"monospace",textAlign:"center"}}>
            {v}
          </div>
        ))}
      </div>
    </div>
  );
}

function QueueViz({items}){
  if(!items.length) return null;
  return(
    <div style={{marginBottom:12}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
        <span style={{color:TH.dimText,fontSize:10,fontWeight:700,letterSpacing:2,textTransform:"uppercase"}}>Queue</span>
        <div style={{flex:1,height:1,background:TH.border}}/>
      </div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
        {items.map((v,i)=>(
          <div key={i} style={{minWidth:46,padding:"6px 8px",background:TH.bgRaised,border:`1px solid ${TH.border}`,borderRadius:6,color:TH.white,fontFamily:"monospace",textAlign:"center"}}>
            {v}
          </div>
        ))}
      </div>
    </div>
  );
}

function TreeViz({trees}){
  if(!trees.length) return null;
  return(
    <div style={{marginBottom:12}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
        <span style={{color:TH.dimText,fontSize:10,fontWeight:700,letterSpacing:2,textTransform:"uppercase"}}>Binary Tree</span>
        <div style={{flex:1,height:1,background:TH.border}}/>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {trees.map((levels,ti)=>{
          const maxDepth = levels.length - 1;
          const layoutW = Math.max(480, (2 ** maxDepth) * 50);
          const rowGap = 44;
          const r = 16;
          const height = (maxDepth + 1) * rowGap;
          const lines = [];
          for (let l = 0; l < levels.length - 1; l++) {
            const lvl = levels[l];
            for (let i = 0; i < lvl.length; i++) {
              const node = lvl[i];
              if (!node) continue;
              const x = (i + 0.5) * (layoutW / (2 ** l));
              const y = l * rowGap + r;
              const left = levels[l + 1][i * 2];
              const right = levels[l + 1][i * 2 + 1];
              if (left) {
                const cx = (i * 2 + 0.5) * (layoutW / (2 ** (l + 1)));
                const cy = (l + 1) * rowGap + r;
                lines.push({ x1: x, y1: y + r, x2: cx, y2: cy - r });
              }
              if (right) {
                const cx = (i * 2 + 1.5) * (layoutW / (2 ** (l + 1)));
                const cy = (l + 1) * rowGap + r;
                lines.push({ x1: x, y1: y + r, x2: cx, y2: cy - r });
              }
            }
          }
          return (
            <div key={ti} style={{position:"relative",padding:"10px 0 20px",overflowX:"auto"}}>
              <div style={{width:layoutW,position:"relative"}}>
              <svg viewBox={`0 0 ${layoutW} ${height}`} style={{width:layoutW,height:height,display:"block"}}>
                {lines.map((ln,idx)=>(
                  <line key={idx} x1={ln.x1} y1={ln.y1} x2={ln.x2} y2={ln.y2} stroke={TH.orange} strokeWidth="2" />
                ))}
              </svg>
              <div style={{position:"absolute",inset:0,width:layoutW,height:height}}>
                {levels.map((lvl,li)=>(
                  <div key={li} style={{display:"grid",gridTemplateColumns:`repeat(${2 ** maxDepth},1fr)`,alignItems:"center",gap:0,position:"absolute",left:0,right:0,top:li*rowGap+2}}>
                    {lvl.map((n,ni)=>{
                      const span = 2 ** (maxDepth - li);
                      return (
                        <div key={`${li}-${ni}`} style={{gridColumn:`span ${span}`,display:"flex",justifyContent:"center"}}>
                          {n ? (
                            <div style={{width:32,height:32,borderRadius:"50%",background:TH.bgRaised,border:`2px solid ${TH.orange}`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"monospace",fontWeight:800,color:TH.white,fontSize:11}}>
                              {n.value}
                            </div>
                          ) : (
                            <div style={{width:32,height:32,opacity:0}} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FrameCard({frame,isTop,prevFrame}){
  const entries=Object.entries(frame.locals);
  return(
    <div style={{background:TH.bgCard,border:`1px solid ${isTop?TH.accent:TH.border}`,borderRadius:10,overflow:"hidden",boxShadow:isTop?`0 0 16px ${TH.accent}22`:"none"}}>
      <div style={{background:isTop?`${TH.accent}18`:TH.bgRaised,padding:"7px 12px",display:"flex",alignItems:"center",gap:8,borderBottom:`1px solid ${isTop?TH.accent:TH.border}`}}>
        <div style={{width:7,height:7,borderRadius:"50%",background:isTop?TH.green:TH.dimText}}/>
        <span style={{color:isTop?TH.white:TH.midText,fontFamily:"monospace",fontWeight:700,fontSize:12}}>{frame.name}()</span>
        {isTop&&<span style={{fontSize:9,color:TH.green,background:`${TH.green}20`,padding:"1px 6px",borderRadius:3,letterSpacing:1,marginLeft:"auto"}}>ACTIVE</span>}
      </div>
      <div style={{padding:10,display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(110px,1fr))",gap:7}}>
        {entries.length===0
          ?<span style={{color:TH.dimText,fontSize:11,fontStyle:"italic"}}>empty frame</span>
          :entries.map(([k,v])=>{
            const pv=prevFrame&&prevFrame.locals[k];
            const addr=frame.addrs&&frame.addrs[k];
            return <VarCell key={k} name={k} val={v} changed={!prevFrame||JSON.stringify(pv)!==JSON.stringify(v)} addr={addr}/>;
          })
        }
      </div>
    </div>
  );
}

function FlowTag({desc}){
  if(!desc) return null;
  const isPrint=/printf|puts|putchar/.test(desc);
  const isRet=/^return/.test(desc);
  const isCall=/^call /.test(desc);
  const isLoop=/for #|while #|do-while/.test(desc);
  const isIf=/^if /.test(desc);
  const isDecl=/^declare/.test(desc);
  const isMalloc=/^malloc/.test(desc);
  const isScanf=/^scanf/.test(desc);
  const color=isMalloc?TH.orange:isPrint?TH.green:isRet?TH.red:isCall?TH.orange:isLoop?TH.accent:isIf?"#06b6d4":isDecl?TH.purple:isScanf?TH.orange:TH.midText;
  const label=isMalloc?"MALLOC":isPrint?"OUTPUT":isRet?"RETURN":isCall?"CALL":isLoop?"LOOP":isIf?"BRANCH":isDecl?"DECLARE":isScanf?"INPUT":"ASSIGN";
  return(
    <div style={{background:`${color}0e`,border:`1px solid ${color}35`,borderRadius:8,padding:"9px 13px",display:"flex",alignItems:"flex-start",gap:9}}>
      <span style={{background:`${color}22`,color,fontSize:9,fontWeight:800,letterSpacing:1.5,padding:"2px 6px",borderRadius:4,textTransform:"uppercase",whiteSpace:"nowrap",marginTop:1}}>{label}</span>
      <span style={{color:TH.bright,fontSize:12,fontFamily:"monospace",lineHeight:1.5,wordBreak:"break-all"}}>{desc}</span>
    </div>
  );
}

function Viz({steps,cur}){
  if(!steps||!steps[cur]) return null;
  const step=steps[cur], prev=cur>0?steps[cur-1]:null;
  const frames=step.stack||[], prevFrames=prev?prev.stack||[]:[];
  const heapEntries=Object.entries(step.heap||{}).filter(([_,v])=>v&&typeof v==="object"&&(v.__type==="struct"||v.__type==="raw"));
  const heapMap = step.heap || {};
  const isPtr = (v) => typeof v==="number" && v>=256 && heapMap[v];
  const structAt = (addr) => {
    const obj = heapMap[addr];
    return obj && obj.__type==="struct" ? obj : null;
  };

  const ptrCandidates = [];
  const pushVal = (v) => {
    if (typeof v === "number") { if (isPtr(v)) ptrCandidates.push(v); return; }
    if (Array.isArray(v)) { v.forEach(pushVal); return; }
    if (v && typeof v === "object" && v.__type === "struct") {
      Object.values(v).forEach(pushVal);
      return;
    }
  };
  Object.values(step.globals||{}).forEach(pushVal);
  frames.forEach(f => Object.values(f.locals||{}).forEach(pushVal));

  const LIST_FIELDS = ["next","nxt","link"];
  const LEFT_FIELDS = ["left","l","lchild","leftChild"];
  const RIGHT_FIELDS = ["right","r","rchild","rightChild"];
  const getField = (obj, names) => {
    for (const n of names) if (n in obj) return obj[n];
    return undefined;
  };

  const listHeads = [];
  const treeHeads = [];
  for (const addr of ptrCandidates) {
    const obj = structAt(addr);
    if (!obj) continue;
    if (LIST_FIELDS.some(n => n in obj)) listHeads.push(addr);
    if (LEFT_FIELDS.some(n => n in obj) || RIGHT_FIELDS.some(n => n in obj)) treeHeads.push(addr);
  }

  const buildList = (head) => {
    const nodes = [];
    const seen = new Set();
    let curAddr = head;
    while (curAddr && isPtr(curAddr) && !seen.has(curAddr)) {
      const obj = structAt(curAddr);
      if (!obj) break;
      nodes.push({ addr: curAddr, value: nodeValueFromStruct(obj) });
      seen.add(curAddr);
      const nextVal = getField(obj, LIST_FIELDS);
      if (!isPtr(nextVal)) break;
      curAddr = nextVal;
    }
    return nodes;
  };

  const lists = [];
  const usedListHeads = new Set();
  for (const h of listHeads) {
    if (usedListHeads.has(h)) continue;
    const nodes = buildList(h);
    if (nodes.length) {
      lists.push(nodes);
      usedListHeads.add(h);
    }
  }

  const buildTreeLevels = (root) => {
    const maxDepth = 5;
    const levels = [];
    const seen = new Set();
    let queue = [{ addr: root, idx: 0 }];
    let depth = 0;
    while (depth <= maxDepth) {
      const levelSize = 2 ** depth;
      const level = new Array(levelSize).fill(null);
      const next = [];
      for (const item of queue) {
        const addr = item.addr;
        if (!isPtr(addr) || seen.has(addr) || item.idx >= levelSize) continue;
        const obj = structAt(addr);
        if (!obj) continue;
        seen.add(addr);
        const v = ("data" in obj) ? obj.data : ("val" in obj ? obj.val : ("key" in obj ? obj.key : nodeValueFromStruct(obj)));
        level[item.idx] = { addr, value: v };
        if (depth < maxDepth) {
          const leftVal = getField(obj, LEFT_FIELDS);
          const rightVal = getField(obj, RIGHT_FIELDS);
          if (isPtr(leftVal)) next.push({ addr: leftVal, idx: item.idx * 2 });
          if (isPtr(rightVal)) next.push({ addr: rightVal, idx: item.idx * 2 + 1 });
        }
      }
      const hasAny = level.some(Boolean);
      if (!hasAny) break;
      levels.push(level);
      queue = next;
      depth++;
    }
    return levels;
  };

  const trees = [];
  const usedTreeHeads = new Set();
  for (const h of treeHeads) {
    if (usedTreeHeads.has(h)) continue;
    const levels = buildTreeLevels(h);
    if (levels.length) {
      trees.push(levels);
      usedTreeHeads.add(h);
    }
  }

  const stackItems = [];
  const queueItems = [];
  const globals = step.globals || {};
  if (Array.isArray(globals.stack) && typeof globals.top === "number") {
    const max = Math.min(globals.top, globals.stack.length - 1);
    for (let i = 0; i <= max; i++) stackItems.push(globals.stack[i]);
  }
  if (Array.isArray(globals.queue)) {
    if (typeof globals.front === "number" && typeof globals.rear === "number") {
      const start = Math.max(0, globals.front);
      const end = Math.min(globals.queue.length - 1, globals.rear);
      for (let i = start; i <= end; i++) queueItems.push(globals.queue[i]);
    } else {
      queueItems.push(...globals.queue);
    }
  }

  return(
    <div style={{display:"flex",flexDirection:"column",gap:14,padding:14,background:TH.bgDeep,height:"100%",overflowY:"auto",overflowX:"hidden",boxSizing:"border-box"}}>
      <FlowTag desc={step.desc}/>

      <div>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:7}}>
          <span style={{color:TH.dimText,fontSize:10,fontWeight:700,letterSpacing:2,textTransform:"uppercase"}}>stdout</span>
          <div style={{flex:1,height:1,background:TH.border}}/>
        </div>
        <div style={{background:"#000",border:`1px solid ${TH.border}`,borderRadius:7,padding:12,fontFamily:"monospace",fontSize:12,color:step.stdout?TH.green:TH.dimText,minHeight:48,whiteSpace:"pre-wrap",wordBreak:"break-all",lineHeight:1.6}}>
          {step.stdout||<span style={{fontStyle:"italic",color:TH.dimText}}>no output yet…</span>}
        </div>
      </div>

      {frames.length>0&&(
        <div>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
            <span style={{color:TH.dimText,fontSize:10,fontWeight:700,letterSpacing:2,textTransform:"uppercase"}}>Call Stack</span>
            <div style={{flex:1,height:1,background:TH.border}}/>
            <span style={{color:TH.dimText,fontSize:10}}>{frames.length} frame{frames.length!==1?"s":""}</span>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:7}}>
            {[...frames].reverse().map((f,ri)=>{
              const oi=frames.length-1-ri;
              return <FrameCard key={`${f.name}-${oi}`} frame={f} isTop={ri===0} prevFrame={prevFrames[oi]||null}/>;
            })}
          </div>
        </div>
      )}

      {Object.keys(step.globals||{}).length>0&&(
        <div>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
            <span style={{color:TH.dimText,fontSize:10,fontWeight:700,letterSpacing:2,textTransform:"uppercase"}}>Globals</span>
            <div style={{flex:1,height:1,background:TH.border}}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(110px,1fr))",gap:7}}>
            {Object.entries(step.globals).map(([k,v])=>(
              <VarCell key={k} name={k} val={v} changed={!prev||JSON.stringify(prev.globals[k])!==JSON.stringify(v)}/>
            ))}
          </div>
        </div>
      )}

      {(lists.length>0 || trees.length>0 || stackItems.length>0 || queueItems.length>0) && (
        <div>
          {lists.length>0 && <LinkedListViz lists={lists}/>}
          {stackItems.length>0 && <StackViz items={stackItems}/>}
          {queueItems.length>0 && <QueueViz items={queueItems}/>}
          {trees.length>0 && <TreeViz trees={trees}/>}
        </div>
      )}

      {heapEntries.length>0&&(
        <div>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
            <span style={{color:TH.dimText,fontSize:10,fontWeight:700,letterSpacing:2,textTransform:"uppercase"}}>Heap Memory</span>
            <div style={{flex:1,height:1,background:TH.border}}/>
            <span style={{color:TH.dimText,fontSize:10}}>{heapEntries.length} block{heapEntries.length!==1?"s":""}</span>
          </div>
          <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
            {heapEntries.map(([addr,obj])=>(
              <HeapCard key={addr} addr={addr} obj={obj} prevObj={prev?.heap?.[addr]}/>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
//  DEFAULT CODE
// ════════════════════════════════════════════════════════════
const DEFAULT_CODE =
`#include <stdio.h>
#include <stdlib.h>

struct Node {
    int data;
    struct Node* next;
};

struct Node* createNode(int val) {
    struct Node* n = (struct Node*)malloc(sizeof(struct Node));
    n->data = val;
    n->next = NULL;
    return n;
}

int main() {
    struct Node* head = NULL;
    struct Node* tail = NULL;
    int i;

    for (i = 1; i <= 4; i++) {
        struct Node* n = createNode(i * 10);
        if (head == NULL) {
            head = n;
            tail = n;
        } else {
            tail->next = n;
            tail = n;
        }
    }

    struct Node* curr = head;
    while (curr != NULL) {
        printf("%d -> ", curr->data);
        curr = curr->next;
    }
    printf("NULL\\n");

    return 0;
}
`;

// ════════════════════════════════════════════════════════════
//  MAIN APP
// ════════════════════════════════════════════════════════════
export default function App() {
  const [code,setCode]       = useState(DEFAULT_CODE);
  const [input,setInput]     = useState("");
  const [scannedInput,setScannedInput] = useState("");
  const [hasScanned,setHasScanned] = useState(false);
  const scannedInputRef = useRef("");
  const hasScannedRef = useRef(false);
  const [output,setOutput]   = useState("Ready.\nClick \"Compile & Run\" to execute.");
  const [isRunning,setIsRunning] = useState(false);
  const [tab,setTab]         = useState("visualizer");
  const [copied,setCopied]   = useState(false);
  const [traceSteps,setTraceSteps] = useState(null);
  const [curStep,setCurStep] = useState(0);
  const [traceErr,setTraceErr] = useState("");
  const [isTracing,setIsTracing] = useState(false);
  const [playing,setPlaying] = useState(false);
  const [analysis,setAnalysis] = useState({ ok:true, structures:{}, complexity:{} });

  const taRef=useRef(null), preRef=useRef(null), lnRef=useRef(null), playRef=useRef(null);
  const workerRef = useRef(null);
  const workerUrlRef = useRef(null);
  const runIdRef = useRef(0);
  const wasmWorkerRef = useRef(null);
  const wasmRunIdRef = useRef(0);
  const MONO = {fontFamily:"'Fira Code','Consolas','Monaco',monospace",fontSize:13,lineHeight:"22px",tabSize:4,whiteSpace:"pre"};

  const syncScroll = (e) => {
    if(preRef.current){ preRef.current.scrollTop=e.target.scrollTop; preRef.current.scrollLeft=e.target.scrollLeft; }
    if(lnRef.current) lnRef.current.scrollTop=e.target.scrollTop;
  };
  const onKey = (e) => {
    if(e.key==="Tab"){
      e.preventDefault();
      const{selectionStart:s,selectionEnd:en,value:v}=e.target;
      setCode(v.substring(0,s)+"    "+v.substring(en));
      setTimeout(()=>{e.target.selectionStart=e.target.selectionEnd=s+4;},0);
    }
  };

  useEffect(()=>{
    if(traceSteps&&traceSteps[curStep]&&taRef.current){
      const ln=traceSteps[curStep].line, top=(ln-1)*22, h=taRef.current.clientHeight;
      taRef.current.scrollTo({top:Math.max(0,top-h/2+11),behavior:"smooth"});
    }
  },[curStep,traceSteps]);

  useEffect(()=>{
    clearTimeout(playRef.current);
    if(playing&&traceSteps){
      if(curStep>=traceSteps.length-1){setPlaying(false);return;}
      playRef.current=setTimeout(()=>setCurStep(p=>p+1),480);
    }
    return()=>clearTimeout(playRef.current);
  },[playing,curStep,traceSteps]);

  useEffect(() => {
    const t = setTimeout(() => {
      setAnalysis(analyzeCode(code));
    }, 150);
    return () => clearTimeout(t);
  }, [code]);

  useEffect(() => {
    const created = createTraceWorker();
    if (!created) return;
    const { worker, url } = created;
    workerRef.current = worker;
    workerUrlRef.current = url;

    worker.onmessage = (e) => {
      const data = e.data || {};
      if (data.runId !== runIdRef.current) return;
      if (data.steps && data.steps.length) {
        setTraceSteps(data.steps);
        if (data.error) setTraceErr(data.error);
      } else if (data.error) {
        setTraceErr(data.error);
      } else {
        setTraceErr("No steps - does your code have a main() function?");
      }
      setIsTracing(false);
    };

    worker.onerror = () => {
      if (runIdRef.current > 0) setTraceErr("Interpreter crashed.");
      setIsTracing(false);
    };

    return () => {
      worker.terminate();
      if (workerUrlRef.current) URL.revokeObjectURL(workerUrlRef.current);
      workerRef.current = null;
      workerUrlRef.current = null;
    };
  }, []);

  useEffect(() => {
    const worker = new Worker(new URL("./wasmWorker.js", import.meta.url), { type: "module" });
    wasmWorkerRef.current = worker;
    worker.onmessage = (e) => {
      const data = e.data || {};
      if (data.runId !== wasmRunIdRef.current) return;
      if (data.error) {
        const out = data.output ? `${data.output}\n` : "";
        setOutput(`${out}Error: ${data.error}`);
      } else {
        setOutput(data.output || "");
      }
      setIsRunning(false);
    };
    worker.onerror = () => {
      setOutput("Error: WASM compiler crashed.");
      setIsRunning(false);
    };
    return () => {
      worker.terminate();
      wasmWorkerRef.current = null;
    };
  }, []);

  const runTrace = useCallback(()=>{
    setIsTracing(true); setTraceErr(""); setTraceSteps(null);
    setCurStep(0); setTab("visualizer"); setPlaying(false);
    if(!hasScannedRef.current && input.trim() !== "") {
      scannedInputRef.current = input;
      hasScannedRef.current = true;
      setScannedInput(input);
      setHasScanned(true);
    }
    const runId = ++runIdRef.current;
    const worker = workerRef.current;
    if (worker) {
      const stdin = hasScannedRef.current ? scannedInputRef.current : "";
      worker.postMessage({ code, stdin, runId });
      return;
    }
    setTimeout(()=>{
      const stdin = hasScannedRef.current ? scannedInputRef.current : "";
      const{steps,error}=runInterpreter(code, stdin);
      if(error) setTraceErr(error);
      else if(!steps.length) setTraceErr("No steps - does your code have a main() function?");
      else setTraceSteps(steps);
      setIsTracing(false);
    },30);
  },[code,input]);

  const runCode = () => {
    setIsRunning(true); setTab("output"); setOutput("Compiling & running locally (WASM)...\n");
    const worker = wasmWorkerRef.current;
    const runId = ++wasmRunIdRef.current;
    const baseUrl = `${import.meta.env.BASE_URL || "/"}wasm/`;
    if(!hasScannedRef.current && input.trim() !== "") {
      scannedInputRef.current = input;
      hasScannedRef.current = true;
      setScannedInput(input);
      setHasScanned(true);
    }
    if (worker) {
      const stdin = hasScannedRef.current ? scannedInputRef.current : "";
      worker.postMessage({ code, stdin, runId, baseUrl });
      return;
    }
    setOutput("Error: WASM worker unavailable.");
    setIsRunning(false);
  };

  const hlLine = traceSteps&&traceSteps[curStep]?traceSteps[curStep].line:null;
  const lineCount = code.split("\n").length;
  const total = traceSteps?traceSteps.length:0;

  const TabBtn=({id,label,Icon,color})=>(
    <button onClick={()=>setTab(id)} style={{flex:1,padding:"9px 4px",fontSize:11,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",gap:5,color:tab===id?TH.white:TH.dimText,background:tab===id?`${color||TH.accent}10`:"transparent",border:"none",borderBottom:`2px solid ${tab===id?(color||TH.accent):"transparent"}`,cursor:"pointer",transition:"all 0.2s"}}>
      <Icon size={12}/>{label}
    </button>
  );

  return(
    <div style={{display:"flex",flexDirection:"column",height:"100vh",background:TH.bgDeep,color:TH.bright,fontFamily:"system-ui,sans-serif",minWidth:680}}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}::-webkit-scrollbar{width:5px;height:5px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:${TH.border};border-radius:3px}textarea{caret-color:#fff!important}`}</style>

      {/* Header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"9px 14px",background:TH.bgCard,borderBottom:`1px solid ${TH.border}`,flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:9}}>
          <div style={{background:`${TH.accent}20`,borderRadius:7,padding:6}}><Code2 size={16} color={TH.accent}/></div>
          <div>
            <div style={{color:TH.white,fontWeight:800,fontSize:13}}>C Cloud Compiler</div>
            <div style={{color:TH.dimText,fontSize:10}}>with Interactive Visualizer</div>
          </div>
        </div>
        <div style={{display:"flex",gap:7}}>
          <button onClick={()=>{navigator.clipboard.writeText(code).catch(()=>{});setCopied(true);setTimeout(()=>setCopied(false),2000);}} style={{display:"flex",alignItems:"center",gap:5,padding:"6px 12px",background:TH.bgRaised,border:`1px solid ${TH.border}`,borderRadius:6,color:TH.midText,fontSize:11,fontWeight:600,cursor:"pointer"}}>
            {copied?<Check size={12} color={TH.green}/>:<Copy size={12}/>}{copied?"Copied":"Copy"}
          </button>
          <button onClick={runCode} disabled={isRunning} style={{display:"flex",alignItems:"center",gap:5,padding:"6px 14px",background:"#16a34a",border:"none",borderRadius:6,color:"#fff",fontSize:11,fontWeight:700,cursor:isRunning?"not-allowed":"pointer",opacity:isRunning?0.7:1}}>
            {isRunning?<Loader2 size={12} style={{animation:"spin 1s linear infinite"}}/>:<Play size={12} fill="#fff"/>}
            {isRunning?"Running…":"Compile & Run"}
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{display:"flex",flex:1,overflow:"hidden"}}>

        {/* Left — Editor */}
        <div style={{width:"50%",display:"flex",flexDirection:"column",borderRight:`1px solid ${TH.border}`}}>
          <div style={{display:"flex",alignItems:"center",padding:"5px 10px",background:TH.bgCard,borderBottom:`1px solid ${TH.border}`,gap:6}}>
            <FileText size={12} color={TH.dimText}/>
            <span style={{fontFamily:"monospace",color:TH.bright,fontSize:11}}>main.c</span>
          </div>

          <div style={{display:"flex",flex:1,overflow:"hidden",position:"relative"}}>
            {/* Line numbers */}
            <div ref={lnRef} style={{width:38,paddingTop:12,paddingBottom:12,paddingRight:6,background:TH.bgDeep,borderRight:`1px solid ${TH.border}`,overflowY:"hidden",textAlign:"right",userSelect:"none",...MONO,fontSize:11,color:TH.dimText}}>
              {Array.from({length:lineCount},(_,i)=>(
                <div key={i} style={{lineHeight:"22px",color:hlLine===i+1?TH.accent:TH.dimText,fontWeight:hlLine===i+1?700:400}}>{i+1}</div>
              ))}
            </div>

            <div style={{flex:1,position:"relative",overflow:"hidden"}}>
              {hlLine&&<div style={{position:"absolute",left:0,right:0,top:(hlLine-1)*22+12,height:22,background:`${TH.accent}1e`,borderLeft:`3px solid ${TH.accent}`,pointerEvents:"none",zIndex:2,transition:"top 0.18s ease"}}/>}
              <pre ref={preRef} style={{position:"absolute",inset:0,margin:0,padding:12,...MONO,color:TH.bright,pointerEvents:"none",overflow:"hidden",zIndex:1}} dangerouslySetInnerHTML={{__html:highlight(code)}}/>
              <textarea ref={taRef} value={code} onChange={e=>{setCode(e.target.value);setTraceSteps(null);}} onKeyDown={onKey} onScroll={syncScroll} spellCheck={false}
                style={{position:"absolute",inset:0,width:"100%",height:"100%",padding:12,margin:0,...MONO,background:"transparent",color:"transparent",caretColor:"white",resize:"none",outline:"none",overflow:"auto",zIndex:3,border:"none"}}/>
            </div>
          </div>

          {/* Trace controls */}
          <div style={{background:TH.bgCard,borderTop:`1px solid ${TH.border}`,padding:10,display:"flex",flexDirection:"column",gap:7,flexShrink:0}}>
            <button onClick={runTrace} disabled={isTracing} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:7,padding:"9px 0",background:isTracing?`${TH.accent}50`:TH.accent,border:"none",borderRadius:7,color:"#fff",fontSize:11,fontWeight:800,letterSpacing:1,textTransform:"uppercase",cursor:isTracing?"not-allowed":"pointer"}}>
              {isTracing?<Loader2 size={14} style={{animation:"spin 1s linear infinite"}}/>:<Cpu size={14}/>}
              {isTracing?"Interpreting…":"Trace Execution"}
            </button>

            {traceSteps&&(
              <>
                <div style={{display:"flex",gap:5}}>
                  <button onClick={()=>{setCurStep(0);setPlaying(false);}} style={ctrlBtnStyle}><SkipBack size={12}/></button>
                  <button onClick={()=>setCurStep(p=>Math.max(0,p-1))} disabled={curStep===0} style={{...ctrlBtnStyle,flex:1,opacity:curStep===0?0.4:1}}><ChevronLeft size={13}/>PREV</button>
                  <button onClick={()=>setPlaying(p=>!p)} style={{...ctrlBtnStyle,flex:1,background:playing?`${TH.orange}18`:TH.bgRaised,color:playing?TH.orange:TH.midText}}>{playing?"⏸":"▶"} {playing?"PAUSE":"PLAY"}</button>
                  <button onClick={()=>setCurStep(p=>Math.min(total-1,p+1))} disabled={curStep===total-1} style={{...ctrlBtnStyle,flex:1,opacity:curStep===total-1?0.4:1}}>NEXT<ChevronRight size={13}/></button>
                  <button onClick={()=>{setCurStep(total-1);setPlaying(false);}} style={ctrlBtnStyle}><SkipForward size={12}/></button>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{flex:1,height:3,background:TH.border,borderRadius:2,cursor:"pointer",overflow:"hidden"}}
                    onClick={e=>{const r=e.currentTarget.getBoundingClientRect();setCurStep(Math.min(total-1,Math.floor(((e.clientX-r.left)/r.width)*total)));setPlaying(false);}}>
                    <div style={{width:`${((curStep+1)/total)*100}%`,height:"100%",background:TH.accent,borderRadius:2,transition:"width 0.15s"}}/>
                  </div>
                  <span style={{color:TH.dimText,fontSize:10,fontFamily:"monospace",whiteSpace:"nowrap"}}>{curStep+1}/{total}</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right */}
        <div style={{width:"50%",display:"flex",flexDirection:"column"}}>
          <div style={{display:"flex",background:TH.bgCard,borderBottom:`1px solid ${TH.border}`,flexShrink:0}}>
            <TabBtn id="output" label="Output" Icon={Terminal} color={TH.green}/>
            <TabBtn id="input" label="Input" Icon={Keyboard} color={TH.orange}/>
            <TabBtn id="visualizer" label="Visualizer" Icon={Eye} color={TH.accent}/>
            <TabBtn id="analysis" label="Analysis" Icon={ListTree} color={TH.purple}/>
          </div>

          <div style={{flex:1,overflow:"hidden",position:"relative"}}>
            {tab==="output"&&(
              <div style={{height:"100%",overflowY:"auto",padding:14}}>
                <pre style={{fontFamily:"monospace",fontSize:12,color:TH.bright,whiteSpace:"pre-wrap",margin:0,lineHeight:1.7}}>{output}</pre>
              </div>
            )}
            {tab==="input"&&(
              <div style={{height:"100%",display:"flex",flexDirection:"column"}}>
                <div style={{padding:"10px 14px",borderBottom:`1px solid ${TH.border}`,display:"flex",alignItems:"center",gap:10}}>
                  <button
                    onClick={()=>{
                      scannedInputRef.current = input;
                      hasScannedRef.current = true;
                      setScannedInput(input);
                      setHasScanned(true);
                    }}
                    style={{padding:"6px 12px",background:TH.accent,border:"none",borderRadius:6,color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer"}}
                  >
                    Scan
                  </button>
                  <span style={{color:hasScanned?TH.green:TH.dimText,fontSize:10,fontFamily:"monospace"}}>
                    {hasScanned ? "Input captured" : "Not scanned"}
                  </span>
                </div>
                <textarea value={input} onChange={e=>{setInput(e.target.value); setHasScanned(false); hasScannedRef.current=false;}} placeholder="stdin for scanf()…" spellCheck={false}
                  style={{flex:1,width:"100%",padding:14,background:"transparent",color:TH.bright,fontFamily:"monospace",fontSize:12,resize:"none",outline:"none",border:"none",boxSizing:"border-box"}}/>
              </div>
            )}
            {tab==="visualizer"&&(
              isTracing?(
                <div style={{height:"100%",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:10}}>
                  <Loader2 size={32} color={TH.accent} style={{animation:"spin 1s linear infinite"}}/>
                  <span style={{color:TH.midText,fontSize:12,fontWeight:600}}>Interpreting C code…</span>
                </div>
              ):traceSteps?(
                <Viz steps={traceSteps} cur={curStep}/>
              ):traceErr?(
                <div style={{height:"100%",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
                  <div style={{background:`${TH.red}0e`,border:`1px solid ${TH.red}35`,borderRadius:10,padding:18,maxWidth:380,textAlign:"center"}}>
                    <AlertTriangle size={26} color={TH.red} style={{marginBottom:8}}/>
                    <div style={{color:TH.white,fontWeight:700,marginBottom:6,fontSize:13}}>Interpreter Error</div>
                    <div style={{color:TH.midText,fontSize:11,fontFamily:"monospace",lineHeight:1.7,textAlign:"left"}}>{traceErr}</div>
                    <div style={{color:TH.dimText,fontSize:10,marginTop:10}}>Use "Compile &amp; Run" for exact output from complex programs.</div>
                  </div>
                </div>
              ):(
                <div style={{height:"100%",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:10,padding:20,textAlign:"center"}}>
                  <Cpu size={44} color={`${TH.accent}50`}/>
                  <div style={{color:TH.white,fontWeight:700,fontSize:14}}>Ready to Visualize</div>
                  <div style={{fontSize:11,color:TH.midText,maxWidth:280,lineHeight:1.7}}>
                    Click <span style={{color:TH.accent,fontWeight:700}}>Trace Execution</span> for a local, instant, step-by-step visualization.
                  </div>
                  <div style={{display:"flex",flexWrap:"wrap",justifyContent:"center",gap:5,marginTop:4}}>
                    {["Structs","Linked lists","malloc/free","Pointers","Call stack","Recursion","Arrays","Globals","switch"].map(f=>(
                      <span key={f} style={{background:`${TH.accent}12`,color:"#818cf8",fontSize:10,padding:"2px 8px",borderRadius:10,border:`1px solid ${TH.accent}28`}}>{f}</span>
                    ))}
                  </div>
                </div>
              )
            )}
            {tab==="analysis"&&(
              <div style={{height:"100%",overflowY:"auto",padding:14}}>
                {!analysis.ok ? (
                  <div style={{color:TH.red,fontFamily:"monospace",fontSize:12}}>{analysis.error}</div>
                ) : (
                  <div style={{display:"flex",flexDirection:"column",gap:14}}>
                    <div style={{background:TH.bgRaised,border:`1px solid ${TH.border}`,borderRadius:8,padding:12}}>
                      <div style={{color:TH.dimText,fontSize:10,fontWeight:700,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Detected Structures</div>
                      <div style={{color:TH.white,fontSize:12,fontFamily:"monospace",lineHeight:1.7}}>
                        <div>Linked List: {analysis.structures.linkedList?.length?analysis.structures.linkedList.join(", "):"none"}</div>
                        <div>Binary Tree: {analysis.structures.binaryTree?.length?analysis.structures.binaryTree.join(", "):"none"}</div>
                        <div>AVL Tree: {analysis.structures.avlTree?.length?analysis.structures.avlTree.join(", "):"none"}</div>
                      </div>
                    </div>
                    <div style={{background:TH.bgRaised,border:`1px solid ${TH.border}`,borderRadius:8,padding:12}}>
                      <div style={{color:TH.dimText,fontSize:10,fontWeight:700,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Complexity</div>
                      <div style={{color:TH.white,fontSize:12,fontFamily:"monospace",lineHeight:1.7}}>
                        <div>Time: {analysis.complexity.time||"O(1)"}</div>
                        <div>Space: {analysis.complexity.space||"O(1)"}</div>
                        <div>Loop Depth: {analysis.complexity.maxDepth||0}</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}