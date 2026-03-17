import { Code2, Check, Copy, Loader2, Play } from "lucide-react";
import { TH } from "../theme";

export default function HeaderBar({ code, copied, setCopied, isRunning, runCode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "9px 14px",
        background: TH.bgCard,
        borderBottom: `1px solid ${TH.border}`,
        flexShrink: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <div style={{ background: `${TH.accent}20`, borderRadius: 7, padding: 6 }}>
          <Code2 size={16} color={TH.accent} />
        </div>
        <div>
          <div style={{ color: TH.white, fontWeight: 800, fontSize: 13 }}>C Cloud Compiler</div>
          <div style={{ color: TH.dimText, fontSize: 10 }}>with Interactive Visualizer</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 7 }}>
        <button
          onClick={() => {
            navigator.clipboard.writeText(code).catch(() => {});
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            padding: "6px 12px",
            background: TH.bgRaised,
            border: `1px solid ${TH.border}`,
            borderRadius: 6,
            color: TH.midText,
            fontSize: 11,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {copied ? <Check size={12} color={TH.green} /> : <Copy size={12} />}
          {copied ? "Copied" : "Copy"}
        </button>
        <button
          onClick={runCode}
          disabled={isRunning}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            padding: "6px 14px",
            background: "#16a34a",
            border: "none",
            borderRadius: 6,
            color: "#fff",
            fontSize: 11,
            fontWeight: 700,
            cursor: isRunning ? "not-allowed" : "pointer",
            opacity: isRunning ? 0.7 : 1,
          }}
        >
          {isRunning ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : <Play size={12} fill="#fff" />}
          {isRunning ? "Running…" : "Compile & Run"}
        </button>
      </div>
    </div>
  );
}
