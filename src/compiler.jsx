import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Play, 
  ChevronRight, 
  RotateCcw, 
  Code, 
  Cpu, 
  Layers, 
  Database,
  ArrowRight,
  ChevronDown,
  Terminal,
  Activity,
  Zap,
  CheckCircle2,
  GitBranch,
  Repeat,
  ChevronLeft,
  Search,
  Plus,
  Trash2,
  Eye,
  ListTree
} from 'lucide-react';

/**
 * VISUALC-DS v2.0: ENHANCED DSA VIRTUAL MACHINE
 * Features: Sidebar Navigation, Array Ops, Linked List Ops, Stack & Queue Ops.
 */

const MENU_STRUCTURE = {
  "C Operators": ["Arithmetic", "Assignment", "Comparison", "Logical"],
  "C Arrays": ["Search", "Sort", "Insert", "Delete"],
  "C Linked List": ["Insert Beginning", "Insert End", "Insert Position", "Delete Beginning", "Delete End"],
  "C Binary Tree": ["Inorder", "Preorder", "Postorder"],
  "C Stack": ["Push", "Pop", "Peek"],
  "C Queue": ["Enqueue", "Dequeue"]
};

const CODE_TEMPLATES = {
  "Arithmetic": `int a = 100 + 50;\nint b = a + 250;\nint c = b + b;`,
  "Search": `int arr[5] = {10, 20, 30, 40, 50};\nint target = 30;\nint foundAt = -1;\n\nfor (int i = 0; i < 5; i++) {\n    if (arr[i] == target) {\n        foundAt = i;\n    }\n}`,
  "Sort": `int arr[5] = {50, 10, 40, 20, 30};\n\nfor (int i = 0; i < 4; i++) {\n    if (arr[i] > arr[i+1]) {\n        int temp = arr[i];\n        arr[i] = arr[i+1];\n        arr[i+1] = temp;\n    }\n}`,
  "Insert": `// Insert 30 at position 2\nint arr[5] = {10, 20, 40, 50, 0};\nint val = 30;\nint pos = 2;\n\nfor (int i = 3; i >= pos; i--) {\n    arr[i+1] = arr[i];\n}\narr[pos] = val;`,
  "Delete": `// Delete value at position 2\nint arr[5] = {10, 20, 30, 40, 50};\nint pos = 2;\n\nfor (int i = pos; i < 4; i++) {\n    arr[i] = arr[i+1];\n}\narr[4] = 0;`,
  "Insert Beginning": `Node* head = createNode(20);\nNode* newNode = createNode(10);\nnewNode->next = head;\nhead = newNode;`,
  "Insert End": `Node* head = createNode(10);\nNode* second = createNode(20);\nhead->next = second;\nNode* newNode = createNode(30);\nsecond->next = newNode;`,
  "Insert Position": `Node* head = createNode(10);\nNode* third = createNode(30);\nhead->next = third;\n\nNode* newNode = createNode(20);\nnewNode->next = third;\nhead->next = newNode;`,
  "Delete Beginning": `Node* head = createNode(10);\nNode* second = createNode(20);\nhead->next = second;\n\nhead = second;`,
  "Delete End": `Node* head = createNode(10);\nNode* second = createNode(20);\nhead->next = second;\n\nhead->next = NULL;`,
  "Push": `stack s;\ns.push(10);\ns.push(20);\ns.push(30);`,
  "Pop": `stack s;\ns.push(10);\ns.push(20);\nint val = s.pop();`,
  "Peek": `stack s;\ns.push(50);\nint topVal = s.peek();`,
  "Enqueue": `queue q;\nq.enqueue(10);\nq.enqueue(20);\nq.enqueue(30);`,
  "Dequeue": `queue q;\nq.enqueue(10);\nq.enqueue(20);\nint val = q.dequeue();`,
  "Inorder": `// Tree Traversal Logic\nNode* root = createNode(10);\nNode* left = createNode(5);\nNode* right = createNode(15);\nroot->left = left;\nroot->right = right;\n// Inorder: 5 -> 10 -> 15`,
  "Preorder": `// Preorder: Root -> Left -> Right\nNode* root = createNode(10);\nNode* left = createNode(5);\nNode* right = createNode(15);\n// Logic...`,
  "Postorder": `// Postorder: Left -> Right -> Root\nNode* root = createNode(10);\nNode* left = createNode(5);\nNode* right = createNode(15);\n// Logic...`
};

const App = () => {
  const [code, setCode] = useState(CODE_TEMPLATES["Arithmetic"]);
  const [selectedSub, setSelectedSub] = useState("Arithmetic");
  const [executionState, setExecutionState] = useState({
    variables: {},
    arrays: {},
    stack: [],
    queue: [],
    nodes: [], 
    currentLine: -1,
    isExecuting: false,
    output: []
  });

  const [steps, setSteps] = useState([]);
  const [activeStep, setActiveStep] = useState(-1);
  const [viewMode, setViewMode] = useState('memory');

  const clone = (obj) => JSON.parse(JSON.stringify(obj));

  const resolveValue = (expr, state) => {
    if (!expr) return 0;
    let workingExpr = expr.trim().replace(/;/g, '');
    
    // Resolve NULL
    if (workingExpr === 'NULL') return -1;

    const arrayRegex = /(\w+)\[([^\]]+)\]/g;
    workingExpr = workingExpr.replace(arrayRegex, (match, name, innerExpr) => {
      const idx = resolveValue(innerExpr, state);
      return state.arrays[name]?.values[idx] ?? 0;
    });

    const varNames = Object.keys(state.variables).sort((a, b) => b.length - a.length);
    varNames.forEach(v => {
      const reg = new RegExp(`\\b${v}\\b`, 'g');
      workingExpr = workingExpr.replace(reg, state.variables[v]);
    });

    try {
      const sanitized = workingExpr.replace(/[^0-9+\-*/().<>=!&|\s]/g, '');
      const result = sanitized ? new Function(`return (${sanitized})`)() : 0;
      return typeof result === 'boolean' ? (result ? 1 : 0) : result;
    } catch (e) {
      return isNaN(parseInt(workingExpr)) ? 0 : parseInt(workingExpr);
    }
  };

  const compileAndRun = (inputCode) => {
    const lines = inputCode.split('\n');
    let programSteps = [];
    let state = { variables: {}, arrays: {}, stack: [], queue: [], nodes: [], output: [] };
    let pc = 0, safety = 0, maxSteps = 1000;

    const jumpMap = {};
    const controlStack = [];
    lines.forEach((l, idx) => {
      const line = l.trim();
      if (line.startsWith('for') || line.startsWith('if') || line.startsWith('while')) {
        controlStack.push({ type: line.split('(')[0].trim(), index: idx });
      } else if (line === '}') {
        const start = controlStack.pop();
        if (start) {
          jumpMap[start.index] = idx;
          jumpMap[idx] = start.index;
        }
      }
    });

    while (pc < lines.length && safety < maxSteps) {
      safety++;
      const lineText = lines[pc].trim();
      const record = (desc) => programSteps.push({ line: pc, state: clone(state), description: desc || `Executing line ${pc + 1}` });

      if (!lineText || lineText.startsWith('//') || lineText === '{') { 
        pc++; continue; 
      }

      if (lineText === '}') {
        const loopStart = jumpMap[pc];
        const startLine = lines[loopStart]?.trim();
        if (startLine && (startLine.startsWith('for') || startLine.startsWith('while'))) {
          if (startLine.startsWith('for')) {
             const headerMatch = startLine.match(/for\s*\(([^;]+);([^;]+);([^)]+)\)/);
             if (headerMatch) {
                const incExpr = headerMatch[3].trim();
                if (incExpr.includes('++')) {
                  const varName = incExpr.split('++')[0].trim();
                  state.variables[varName]++;
                } else if (incExpr.includes('=')) {
                  const [name, valExpr] = incExpr.split('=');
                  state.variables[name.replace(/[+\-*/]/g, '').trim()] = resolveValue(valExpr, state);
                }
             }
          }
          pc = loopStart; 
          continue;
        }
        pc++; continue;
      }

      // Handle pointer arithmetic/assignment: head->next = newNode;
      if (lineText.includes('->')) {
        const match = lineText.match(/(\w+)->(next|left|right)\s*=\s*([^;]+);/);
        if (match) {
          const [, fromVar, field, toVar] = match;
          const fromNodeIdx = state.variables[fromVar];
          const toVal = resolveValue(toVar, state);
          if (state.nodes[fromNodeIdx] !== undefined) {
             state.nodes[fromNodeIdx].nextId = toVal === -1 ? null : toVal;
             record(`Pointer: ${fromVar}->${field} assigned to ${toVar}`);
          }
        }
        pc++; continue;
      }

      const arrayDecl = lineText.match(/(?:int|float)\s+(\w+)\s*\[\s*(\d*)\s*\]\s*=\s*\{([^}]+)\}/);
      if (arrayDecl) {
        const [, name, size, vals] = arrayDecl;
        state.arrays[name] = { values: vals.split(',').map(v => resolveValue(v, state)) };
        record(`Memory: Array '${name}' allocated.`);
        pc++; continue;
      }

      const controlMatch = lineText.match(/^(if|while|for)\s*\((.*)\)/);
      if (controlMatch) {
        const [type, conditionExpr] = [controlMatch[1], controlMatch[2]];
        let condition = false;
        if (type === 'for') {
           const parts = conditionExpr.split(';');
           const initMatch = parts[0].match(/(?:int\s+)?(\w+)\s*=\s*(.*)/);
           if (initMatch && state.variables[initMatch[1]] === undefined) state.variables[initMatch[1]] = resolveValue(initMatch[2], state);
           condition = !!resolveValue(parts[1], state);
        } else condition = !!resolveValue(conditionExpr, state);

        if (condition) { record(`${type.toUpperCase()} TRUE. Entering block.`); pc++; }
        else { record(`${type.toUpperCase()} FALSE. Skipping.`); pc = jumpMap[pc] + 1; }
        continue;
      }

      if (lineText.includes('createNode')) {
        const match = lineText.match(/(?:\w+\*?\s+)?(\w+)\s*=\s*createNode\(([^)]+)\);/);
        if (match) {
          const val = resolveValue(match[2], state);
          const newNodeIdx = state.nodes.length;
          state.variables[match[1]] = newNodeIdx;
          state.nodes.push({ id: newNodeIdx, val, nextId: null });
          record(`Heap: Node created with value ${val}`);
        }
        pc++; continue;
      }

      const mutation = lineText.match(/^(\w+)\[([^\]]+)\]\s*=\s*([^;]+);/);
      if (mutation) {
        const idx = resolveValue(mutation[2], state);
        const val = resolveValue(mutation[3], state);
        state.arrays[mutation[1]].values[idx] = val;
        record(`Array update: ${mutation[1]}[${idx}] = ${val}`);
        pc++; continue;
      }

      if (lineText.includes('.push(') || lineText.includes('.enqueue(')) {
        const val = resolveValue(lineText.match(/\(([^)]+)\)/)?.[1] || "0", state);
        if (lineText.includes('.push')) state.stack.push(val); else state.queue.push(val);
        record(`${lineText.includes('.push') ? 'Stack' : 'Queue'} update.`);
        pc++; continue;
      }

      if (lineText.includes('.pop()') || lineText.includes('.dequeue()')) {
        const isPop = lineText.includes('.pop');
        const val = isPop ? state.stack.pop() : state.queue.shift();
        const assignMatch = lineText.match(/(?:int\s+)?(\w+)\s*=\s*/);
        if (assignMatch) state.variables[assignMatch[1]] = val;
        record(`${isPop ? 'Stack Pop' : 'Queue Dequeue'}: ${val}`);
        pc++; continue;
      }

      if (lineText.includes('.peek()')) {
        const val = state.stack[state.stack.length - 1];
        const assignMatch = lineText.match(/(?:int\s+)?(\w+)\s*=\s*/);
        if (assignMatch) state.variables[assignMatch[1]] = val;
        record(`Stack Peek: ${val}`);
        pc++; continue;
      }

      const assignMatch = lineText.match(/^(?:int\s+)?(?:\w+\*?\s+)?(\w+)\s*=\s*([^;]+);/);
      if (assignMatch) {
        const val = resolveValue(assignMatch[2], state);
        state.variables[assignMatch[1]] = val;
        record(`Assignment: ${assignMatch[1]} = ${val}`);
        pc++; continue;
      }

      record(`Running...`);
      pc++;
    }
    return programSteps;
  };

  const start = () => {
    const newSteps = compileAndRun(code);
    if (!newSteps || newSteps.length === 0) {
      console.warn("No executable steps generated.");
      return;
    }
    setSteps(newSteps);
    setActiveStep(0);
    setExecutionState({ ...newSteps[0].state, currentLine: newSteps[0].line, isExecuting: true });
  };

  const reset = () => {
    setSteps([]);
    setActiveStep(-1);
    setExecutionState({ variables: {}, arrays: {}, stack: [], queue: [], nodes: [], currentLine: -1, isExecuting: false, output: [] });
  };

  const handleStepForward = () => {
    if (activeStep < steps.length - 1) {
      const i = activeStep + 1;
      setActiveStep(i);
      setExecutionState({ ...steps[i].state, currentLine: steps[i].line, isExecuting: true });
    } else {
      setExecutionState(p => ({ ...p, isExecuting: false }));
    }
  };

  return (
    <div className="flex h-screen w-full bg-[#f8fafc] text-slate-900 font-sans overflow-hidden">
      
      {/* SIDEBAR NAVIGATION (W3Schools Style) */}
      <div className="w-64 bg-[#f1f1f1] border-r border-slate-300 flex flex-col overflow-y-auto">
        <div className="p-5 bg-white border-b border-slate-200">
          <h1 className="font-bold text-lg text-slate-800 flex items-center gap-2">
            <Zap className="text-emerald-600" size={20} /> VisualC-DS
          </h1>
        </div>
        
        <div className="flex-1 py-4">
          {Object.entries(MENU_STRUCTURE).map(([category, items]) => (
            <div key={category} className="mb-4">
              <div className="px-5 py-2 text-[11px] font-black text-slate-500 uppercase tracking-widest bg-slate-200/40">
                {category}
              </div>
              {items.map(item => (
                <button 
                  key={item}
                  onClick={() => {
                    setSelectedSub(item);
                    setCode(CODE_TEMPLATES[item] || "// Placeholder code");
                    reset();
                  }}
                  className={`w-full text-left px-8 py-2 text-sm transition-all border-l-4 ${
                    selectedSub === item 
                    ? 'bg-emerald-600 text-white border-emerald-800 font-bold' 
                    : 'text-slate-700 border-transparent hover:bg-slate-200'
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* EDITOR SECTION */}
      <div className="w-[38%] flex flex-col bg-white border-r border-slate-200 shadow-xl z-10">
        <div className="p-6 bg-white border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-800">{selectedSub} Example</h2>
            <p className="text-xs text-slate-400 mt-1">Interactive code and memory viewer</p>
          </div>
          <button className="bg-emerald-500 text-white text-[11px] px-4 py-2 rounded-full font-bold hover:bg-emerald-600 shadow-lg shadow-emerald-100 transition-all">
            Try it Yourself »
          </button>
        </div>

        <div className="flex-1 relative bg-[#fdfdfd] overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-12 bg-slate-50 border-r border-slate-100 text-right pr-3 pt-6 text-[11px] text-slate-300 font-mono">
            {code.split('\n').map((_, i) => <div key={i} className="h-6 leading-6">{i+1}</div>)}
          </div>
          <textarea
            className="absolute left-12 top-0 right-0 bottom-0 bg-transparent text-slate-700 p-6 pt-6 font-mono text-[14px] leading-6 resize-none outline-none selection:bg-emerald-500/20"
            value={code}
            spellCheck="false"
            onChange={(e) => { setCode(e.target.value); reset(); }}
          />
          {executionState.currentLine !== -1 && (
            <div 
              className="absolute left-0 right-0 pointer-events-none bg-emerald-500/10 border-y border-emerald-500/20"
              style={{ top: `${executionState.currentLine * 24 + 24}px`, height: '24px' }}
            >
              <div className="w-1 h-full bg-emerald-500" />
            </div>
          )}
        </div>

        <div className="p-6 bg-slate-50 flex gap-4 border-t border-slate-200">
          {!executionState.isExecuting ? (
            <button onClick={start} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-3 shadow-lg shadow-indigo-100 transition-all active:scale-95">
              <Play size={18} fill="white" /> INITIALIZE
            </button>
          ) : (
            <button onClick={handleStepForward} className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-3 shadow-lg shadow-emerald-100 transition-all active:scale-95">
              NEXT STEP <ChevronRight size={20} />
            </button>
          )}
          <button onClick={reset} className="p-4 bg-white border border-slate-200 rounded-xl hover:bg-rose-50 hover:text-rose-500 transition-all">
            <RotateCcw size={20} />
          </button>
        </div>
      </div>

      {/* VISUALIZATION CANVAS */}
      <div className="flex-1 flex flex-col bg-[#f8fafc] overflow-hidden">
        <div className="bg-white border-b border-slate-200 px-10 pt-4 flex gap-8 z-20">
           {['memory', 'console'].map(tab => (
             <button 
               key={tab} 
               onClick={() => setViewMode(tab)} 
               className={`pb-4 px-2 text-[11px] font-black uppercase tracking-widest border-b-4 transition-all ${
                 viewMode === tab ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-400'
               }`}
             >
               {tab}
             </button>
           ))}
        </div>

        <div className="flex-1 overflow-y-auto p-12 bg-white/50">
          {viewMode === 'memory' ? (
            <div className="max-w-3xl mx-auto space-y-12">
              
              {/* CURRENT INSTRUCTION DISPLAY */}
              {activeStep !== -1 && (
                <div className="bg-white p-6 border-2 border-emerald-100 rounded-3xl shadow-xl shadow-slate-200/50 flex items-center gap-6 animate-in slide-in-from-top-6">
                  <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg"><Cpu size={28}/></div>
                  <div>
                    <h3 className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1">Instruction Decoder</h3>
                    <p className="text-xl font-bold text-slate-800">{steps[activeStep]?.description}</p>
                  </div>
                </div>
              )}

              {/* VARIABLE WATCHER */}
              <div className="flex flex-wrap gap-4">
                {Object.entries(executionState.variables).map(([k,v]) => (
                  <div key={k} className="px-6 py-4 bg-white border border-slate-100 rounded-2xl shadow-sm flex flex-col min-w-[100px]">
                    <span className="text-[10px] text-slate-400 font-bold uppercase mb-1">{k}</span>
                    <span className="text-2xl font-mono font-black text-indigo-600">{v === -1 ? 'NULL' : v}</span>
                  </div>
                ))}
              </div>

              {/* MEMORY: ARRAYS */}
              <div className="space-y-8">
                {Object.entries(executionState.arrays).map(([name, data]) => (
                  <div key={name} className="animate-in fade-in slide-in-from-left-4">
                    <h3 className="text-[11px] font-bold text-slate-400 uppercase mb-4 flex items-center gap-2">
                      <Database size={14} className="text-indigo-400"/> Array Memory: {name}
                    </h3>
                    <div className="flex gap-3 overflow-x-auto pb-4">
                      {data.values.map((v, i) => {
                        const isIteratorActive = executionState.variables['i'] === i || executionState.variables['pos'] === i;
                        return (
                          <div key={i} className="flex flex-col items-center">
                            <span className={`text-[10px] font-mono mb-2 ${isIteratorActive ? 'text-indigo-600 font-bold' : 'text-slate-300'}`}>[{i}]</span>
                            <div className={`w-16 h-16 border-2 rounded-2xl flex items-center justify-center font-mono text-xl transition-all duration-300 ${
                              isIteratorActive ? 'bg-indigo-600 border-indigo-600 text-white shadow-xl scale-110 ring-8 ring-indigo-50' : 'bg-white border-slate-200 text-slate-600'
                            }`}>{v}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* MEMORY: HEAP (LINKED LIST) */}
              {executionState.nodes.length > 0 && (
                <div className="space-y-6">
                  <h3 className="text-[11px] font-bold text-slate-400 uppercase mb-4 flex items-center gap-2">
                    <Activity size={14} className="text-rose-400"/> Heap Allocation (Linked List)
                  </h3>
                  <div className="flex flex-wrap items-center gap-8 p-10 bg-slate-50 border-2 border-dashed border-slate-200 rounded-[2.5rem] justify-center">
                    {executionState.nodes.map((node, i) => (
                      <div key={i} className="flex items-center gap-4">
                        <div className="flex bg-white border-2 border-slate-200 rounded-2xl overflow-hidden shadow-lg hover:border-emerald-500 transition-all">
                           <div className="px-8 py-5 font-black text-3xl border-r-2 border-slate-100 text-slate-800">{node.val}</div>
                           <div className="px-5 bg-slate-50 flex flex-col items-center justify-center">
                             <span className="text-[8px] font-black uppercase text-slate-400 mb-1">next</span>
                             <div className={`w-4 h-4 rounded-full shadow-inner ${node.nextId !== null ? 'bg-emerald-500' : 'bg-slate-300'}`}/>
                           </div>
                        </div>
                        {node.nextId !== null ? (
                          <ArrowRight className="text-emerald-400 animate-pulse" size={24}/>
                        ) : (
                          <span className="text-[11px] text-slate-400 font-mono italic px-3 py-1 bg-slate-200 rounded-full">NULL</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* DATA STRUCTURES: STACK & QUEUE */}
              <div className="grid grid-cols-2 gap-12">
                 {executionState.stack.length > 0 && (
                   <div className="animate-in fade-in slide-in-from-bottom-8">
                     <h3 className="text-[11px] font-bold text-slate-400 uppercase mb-4 text-center">
                       <Layers size={14} className="inline mr-2 text-indigo-500"/> Stack Segment
                     </h3>
                     <div className="flex flex-col-reverse gap-2 p-6 border-x-4 border-b-4 border-slate-200 bg-white rounded-b-[2rem] min-h-[250px] shadow-inner">
                        {executionState.stack.map((v, i) => (
                          <div key={i} className="h-12 bg-indigo-500 text-white rounded-xl flex items-center justify-center font-mono text-lg font-black shadow-md animate-in zoom-in-75">
                            {v}
                          </div>
                        ))}
                     </div>
                   </div>
                 )}
                 {executionState.queue.length > 0 && (
                   <div className="animate-in fade-in slide-in-from-bottom-8">
                     <h3 className="text-[11px] font-bold text-slate-400 uppercase mb-4 text-center">
                       <Repeat size={14} className="inline mr-2 text-emerald-500"/> Queue Buffer
                     </h3>
                     <div className="flex gap-2 p-4 border-y-4 border-slate-200 bg-white rounded-xl min-h-[80px] items-center overflow-x-auto">
                        {executionState.queue.map((v, i) => (
                          <div key={i} className="w-14 h-14 bg-emerald-500 text-white rounded-xl flex items-center justify-center font-mono text-lg font-black shadow-md shrink-0 animate-in slide-in-from-left-4">
                            {v}
                          </div>
                        ))}
                     </div>
                   </div>
                 )}
              </div>
            </div>
          ) : (
            <div className="max-w-2xl mx-auto">
              <div className="bg-[#0f172a] rounded-[2.5rem] p-10 font-mono text-emerald-400 shadow-2xl border-t-[10px] border-emerald-500/20 min-h-[500px]">
                <div className="text-[11px] text-slate-500 border-b border-slate-800 pb-4 mb-6 flex items-center gap-3 uppercase font-black">
                  <Terminal size={18}/> Standard Output / Runtime Logs
                </div>
                {executionState.output.map((o, i) => (
                  <div key={i} className="mb-2 text-lg animate-in slide-in-from-left-4">
                    <span className="text-slate-700 mr-4 font-bold">[{i}]</span>
                    <span>{`> ${o}`}</span>
                  </div>
                ))}
                {executionState.output.length === 0 && <span className="text-slate-700 italic text-sm">Waiting for execution state changes...</span>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;