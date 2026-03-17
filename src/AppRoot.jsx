import { useState, useRef, useEffect, useCallback } from "react";
import { TH } from "./theme";
import HeaderBar from "./components/HeaderBar";
import EditorPane from "./components/EditorPane";
import RightPane from "./components/RightPane";
import highlight from "./lib/highlight";
import { analyzeCode, runInterpreter, createTraceWorker } from "./lib/cInterpreter";

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
    printf("NULL\n");

    return 0;
}
`;

export default function AppRoot() {
  const [code, setCode] = useState(DEFAULT_CODE);
  const [input, setInput] = useState("");
  const [scannedInput, setScannedInput] = useState("");
  const [hasScanned, setHasScanned] = useState(false);
  const scannedInputRef = useRef("");
  const hasScannedRef = useRef(false);
  const [output, setOutput] = useState("Ready.\nClick \"Compile & Run\" to execute.");
  const [isRunning, setIsRunning] = useState(false);
  const [tab, setTab] = useState("visualizer");
  const [copied, setCopied] = useState(false);
  const [traceSteps, setTraceSteps] = useState(null);
  const [curStep, setCurStep] = useState(0);
  const [traceErr, setTraceErr] = useState("");
  const [isTracing, setIsTracing] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [analysis, setAnalysis] = useState({ ok: true, structures: {}, complexity: {} });

  const taRef = useRef(null);
  const preRef = useRef(null);
  const lnRef = useRef(null);
  const playRef = useRef(null);
  const workerRef = useRef(null);
  const workerUrlRef = useRef(null);
  const runIdRef = useRef(0);
  const wasmWorkerRef = useRef(null);
  const wasmRunIdRef = useRef(0);
  const MONO = { fontFamily: "'Fira Code','Consolas','Monaco',monospace", fontSize: 13, lineHeight: "22px", tabSize: 4, whiteSpace: "pre" };

  const syncScroll = (e) => {
    if (preRef.current) {
      preRef.current.scrollTop = e.target.scrollTop;
      preRef.current.scrollLeft = e.target.scrollLeft;
    }
    if (lnRef.current) lnRef.current.scrollTop = e.target.scrollTop;
  };

  const onKey = (e) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const { selectionStart: s, selectionEnd: en, value: v } = e.target;
      setCode(v.substring(0, s) + "    " + v.substring(en));
      setTimeout(() => {
        e.target.selectionStart = e.target.selectionEnd = s + 4;
      }, 0);
    }
  };

  useEffect(() => {
    if (traceSteps && traceSteps[curStep] && taRef.current) {
      const ln = traceSteps[curStep].line;
      const top = (ln - 1) * 22;
      const h = taRef.current.clientHeight;
      taRef.current.scrollTo({ top: Math.max(0, top - h / 2 + 11), behavior: "smooth" });
    }
  }, [curStep, traceSteps]);

  useEffect(() => {
    clearTimeout(playRef.current);
    if (playing && traceSteps) {
      if (curStep >= traceSteps.length - 1) {
        setPlaying(false);
        return;
      }
      playRef.current = setTimeout(() => setCurStep((p) => p + 1), 480);
    }
    return () => clearTimeout(playRef.current);
  }, [playing, curStep, traceSteps]);

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
      if (data.error) {
        setTraceErr(data.error);
        if (String(data.error).includes("scanf: no stdin provided")) {
          setTab("input");
        }
      }
      else if (!data.steps || !data.steps.length) setTraceErr("No steps - does your code have a main() function?");
      else setTraceSteps(data.steps);
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

  const runTrace = useCallback(() => {
    setIsTracing(true);
    setTraceErr("");
    setTraceSteps(null);
    setCurStep(0);
    setTab("visualizer");
    setPlaying(false);
    if (!hasScannedRef.current && input.trim() === "" && /\bscanf\s*\(/.test(code)) {
      setTab("input");
      setTraceErr("Provide input for scanf() in the Input tab.");
      setIsTracing(false);
      return;
    }
    if (!hasScannedRef.current && input.trim() !== "") {
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
    setTimeout(() => {
      const stdin = hasScannedRef.current ? scannedInputRef.current : "";
      const { steps, error } = runInterpreter(code, stdin);
      if (error) {
        setTraceErr(error);
        if (String(error).includes("scanf: no stdin provided")) {
          setTab("input");
        }
      }
      else if (!steps.length) setTraceErr("No steps - does your code have a main() function?");
      else setTraceSteps(steps);
      setIsTracing(false);
    }, 30);
  }, [code, input]);

  const runCode = () => {
    setIsRunning(true);
    setTab("output");
    setOutput("Compiling & running locally (WASM)...\n");
    const worker = wasmWorkerRef.current;
    const runId = ++wasmRunIdRef.current;
    const baseUrl = `${import.meta.env.BASE_URL || "/"}wasm/`;
    if (!hasScannedRef.current && input.trim() !== "") {
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

  const hlLine = traceSteps && traceSteps[curStep] ? traceSteps[curStep].line : null;
  const lineCount = code.split("\n").length;
  const total = traceSteps ? traceSteps.length : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: TH.bgDeep, color: TH.bright, fontFamily: "system-ui,sans-serif", minWidth: 680 }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}::-webkit-scrollbar{width:5px;height:5px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:${TH.border};border-radius:3px}textarea{caret-color:#fff!important}`}</style>

      <HeaderBar code={code} copied={copied} setCopied={setCopied} isRunning={isRunning} runCode={runCode} />

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <EditorPane
          code={code}
          setCode={setCode}
          setTraceSteps={setTraceSteps}
          traceSteps={traceSteps}
          curStep={curStep}
          setCurStep={setCurStep}
          isTracing={isTracing}
          runTrace={runTrace}
          playing={playing}
          setPlaying={setPlaying}
          total={total}
          hlLine={hlLine}
          lineCount={lineCount}
          taRef={taRef}
          preRef={preRef}
          lnRef={lnRef}
          syncScroll={syncScroll}
          onKey={onKey}
          highlight={highlight}
          MONO={MONO}
        />

        <RightPane
          tab={tab}
          setTab={setTab}
          output={output}
          input={input}
          setInput={setInput}
          hasScanned={hasScanned}
          setHasScanned={setHasScanned}
          scannedInputRef={scannedInputRef}
          hasScannedRef={hasScannedRef}
          setScannedInput={setScannedInput}
          analysis={analysis}
          isTracing={isTracing}
          traceErr={traceErr}
          traceSteps={traceSteps}
          curStep={curStep}
        />
      </div>
    </div>
  );
}
