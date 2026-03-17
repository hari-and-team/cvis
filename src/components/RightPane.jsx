import { Terminal, Keyboard, Eye, ListTree, Cpu, Loader2, AlertTriangle } from "lucide-react";
import { TH } from "../theme";
import Viz from "./Visualizer";

function TabBtn({ id, label, Icon, color, tab, setTab }) {
  return (
    <button
      onClick={() => setTab(id)}
      style={{
        flex: 1,
        padding: "9px 4px",
        fontSize: 11,
        fontWeight: 600,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 5,
        color: tab === id ? TH.white : TH.dimText,
        background: tab === id ? `${color || TH.accent}10` : "transparent",
        border: "none",
        borderBottom: `2px solid ${tab === id ? color || TH.accent : "transparent"}`,
        cursor: "pointer",
        transition: "all 0.2s",
      }}
    >
      <Icon size={12} />
      {label}
    </button>
  );
}

export default function RightPane({
  tab,
  setTab,
  output,
  input,
  setInput,
  hasScanned,
  setHasScanned,
  scannedInputRef,
  hasScannedRef,
  setScannedInput,
  analysis,
  isTracing,
  traceErr,
  traceSteps,
  curStep,
}) {
  return (
    <div style={{ width: "50%", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", background: TH.bgCard, borderBottom: `1px solid ${TH.border}`, flexShrink: 0 }}>
        <TabBtn id="output" label="Output" Icon={Terminal} color={TH.green} tab={tab} setTab={setTab} />
        <TabBtn id="input" label="Input" Icon={Keyboard} color={TH.orange} tab={tab} setTab={setTab} />
        <TabBtn id="visualizer" label="Visualizer" Icon={Eye} color={TH.accent} tab={tab} setTab={setTab} />
        <TabBtn id="analysis" label="Analysis" Icon={ListTree} color={TH.purple} tab={tab} setTab={setTab} />
      </div>

      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        {tab === "output" && (
          <div style={{ height: "100%", overflowY: "auto", padding: 14 }}>
            <pre style={{ fontFamily: "monospace", fontSize: 12, color: TH.bright, whiteSpace: "pre-wrap", margin: 0, lineHeight: 1.7 }}>
              {output}
            </pre>
          </div>
        )}
        {tab === "input" && (
          <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "10px 14px", borderBottom: `1px solid ${TH.border}`, display: "flex", alignItems: "center", gap: 10 }}>
              <button
                onClick={() => {
                  scannedInputRef.current = input;
                  hasScannedRef.current = true;
                  setScannedInput(input);
                  setHasScanned(true);
                }}
                style={{ padding: "6px 12px", background: TH.accent, border: "none", borderRadius: 6, color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
              >
                Scan
              </button>
              <span style={{ color: hasScanned ? TH.green : TH.dimText, fontSize: 10, fontFamily: "monospace" }}>
                {hasScanned ? "Input captured" : "Not scanned"}
              </span>
            </div>
            <textarea
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setHasScanned(false);
                hasScannedRef.current = false;
              }}
              placeholder="stdin for scanf()…"
              spellCheck={false}
              style={{ flex: 1, width: "100%", padding: 14, background: "transparent", color: TH.bright, fontFamily: "monospace", fontSize: 12, resize: "none", outline: "none", border: "none", boxSizing: "border-box" }}
            />
          </div>
        )}
        {tab === "visualizer" &&
          (isTracing ? (
            <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }}>
              <Loader2 size={32} color={TH.accent} style={{ animation: "spin 1s linear infinite" }} />
              <span style={{ color: TH.midText, fontSize: 12, fontWeight: 600 }}>Interpreting C code…</span>
            </div>
          ) : traceErr ? (
            <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
              <div style={{ background: `${TH.red}0e`, border: `1px solid ${TH.red}35`, borderRadius: 10, padding: 18, maxWidth: 380, textAlign: "center" }}>
                <AlertTriangle size={26} color={TH.red} style={{ marginBottom: 8 }} />
                <div style={{ color: TH.white, fontWeight: 700, marginBottom: 6, fontSize: 13 }}>Interpreter Error</div>
                <div style={{ color: TH.midText, fontSize: 11, fontFamily: "monospace", lineHeight: 1.7, textAlign: "left" }}>{traceErr}</div>
                <div style={{ color: TH.dimText, fontSize: 10, marginTop: 10 }}>Use "Compile & Run" for exact output from complex programs.</div>
              </div>
            </div>
          ) : traceSteps ? (
            <Viz steps={traceSteps} cur={curStep} />
          ) : (
            <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: 20, textAlign: "center" }}>
              <Cpu size={44} color={`${TH.accent}50`} />
              <div style={{ color: TH.white, fontWeight: 700, fontSize: 14 }}>Ready to Visualize</div>
              <div style={{ fontSize: 11, color: TH.midText, maxWidth: 280, lineHeight: 1.7 }}>
                Click <span style={{ color: TH.accent, fontWeight: 700 }}>Trace Execution</span> for a local, instant, step-by-step visualization.
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 5, marginTop: 4 }}>
                {[
                  "Structs",
                  "Linked lists",
                  "malloc/free",
                  "Pointers",
                  "Call stack",
                  "Recursion",
                  "Arrays",
                  "Globals",
                  "switch",
                ].map((f) => (
                  <span key={f} style={{ background: `${TH.accent}12`, color: "#818cf8", fontSize: 10, padding: "2px 8px", borderRadius: 10, border: `1px solid ${TH.accent}28` }}>
                    {f}
                  </span>
                ))}
              </div>
            </div>
          ))}
        {tab === "analysis" && (
          <div style={{ height: "100%", overflowY: "auto", padding: 14 }}>
            {!analysis.ok ? (
              <div style={{ color: TH.red, fontFamily: "monospace", fontSize: 12 }}>{analysis.error}</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ background: TH.bgRaised, border: `1px solid ${TH.border}`, borderRadius: 8, padding: 12 }}>
                  <div style={{ color: TH.dimText, fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>Detected Structures</div>
                  <div style={{ color: TH.white, fontSize: 12, fontFamily: "monospace", lineHeight: 1.7 }}>
                    <div>Linked List: {analysis.structures.linkedList?.length ? analysis.structures.linkedList.join(", ") : "none"}</div>
                    <div>Binary Tree: {analysis.structures.binaryTree?.length ? analysis.structures.binaryTree.join(", ") : "none"}</div>
                    <div>AVL Tree: {analysis.structures.avlTree?.length ? analysis.structures.avlTree.join(", ") : "none"}</div>
                  </div>
                </div>
                <div style={{ background: TH.bgRaised, border: `1px solid ${TH.border}`, borderRadius: 8, padding: 12 }}>
                  <div style={{ color: TH.dimText, fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>Complexity</div>
                  <div style={{ color: TH.white, fontSize: 12, fontFamily: "monospace", lineHeight: 1.7 }}>
                    <div>Time: {analysis.complexity.time || "O(1)"}</div>
                    <div>Space: {analysis.complexity.space || "O(1)"}</div>
                    <div>Loop Depth: {analysis.complexity.maxDepth || 0}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
