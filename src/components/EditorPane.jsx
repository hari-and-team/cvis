import { FileText, Cpu, Loader2, ChevronLeft, ChevronRight, SkipBack, SkipForward } from "lucide-react";
import { TH, ctrlBtnStyle } from "../theme";

export default function EditorPane({
  code,
  setCode,
  setTraceSteps,
  traceSteps,
  curStep,
  setCurStep,
  isTracing,
  runTrace,
  playing,
  setPlaying,
  total,
  hlLine,
  lineCount,
  taRef,
  preRef,
  lnRef,
  syncScroll,
  onKey,
  highlight,
  MONO,
}) {
  return (
    <div style={{ width: "50%", display: "flex", flexDirection: "column", borderRight: `1px solid ${TH.border}` }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "5px 10px",
          background: TH.bgCard,
          borderBottom: `1px solid ${TH.border}`,
          gap: 6,
        }}
      >
        <FileText size={12} color={TH.dimText} />
        <span style={{ fontFamily: "monospace", color: TH.bright, fontSize: 11 }}>main.c</span>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden", position: "relative" }}>
        <div
          ref={lnRef}
          style={{
            width: 38,
            paddingTop: 12,
            paddingBottom: 12,
            paddingRight: 6,
            background: TH.bgDeep,
            borderRight: `1px solid ${TH.border}`,
            overflowY: "hidden",
            textAlign: "right",
            userSelect: "none",
            ...MONO,
            fontSize: 11,
            color: TH.dimText,
          }}
        >
          {Array.from({ length: lineCount }, (_, i) => (
            <div
              key={i}
              style={{ lineHeight: "22px", color: hlLine === i + 1 ? TH.accent : TH.dimText, fontWeight: hlLine === i + 1 ? 700 : 400 }}
            >
              {i + 1}
            </div>
          ))}
        </div>

        <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
          {hlLine && (
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: (hlLine - 1) * 22 + 12,
                height: 22,
                background: `${TH.accent}1e`,
                borderLeft: `3px solid ${TH.accent}`,
                pointerEvents: "none",
                zIndex: 2,
                transition: "top 0.18s ease",
              }}
            />
          )}
          <pre
            ref={preRef}
            style={{
              position: "absolute",
              inset: 0,
              margin: 0,
              padding: 12,
              ...MONO,
              color: TH.bright,
              pointerEvents: "none",
              overflow: "hidden",
              zIndex: 1,
            }}
            dangerouslySetInnerHTML={{ __html: highlight(code) }}
          />
          <textarea
            ref={taRef}
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setTraceSteps(null);
            }}
            onKeyDown={onKey}
            onScroll={syncScroll}
            spellCheck={false}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              padding: 12,
              margin: 0,
              ...MONO,
              background: "transparent",
              color: "transparent",
              caretColor: "white",
              resize: "none",
              outline: "none",
              overflow: "auto",
              zIndex: 3,
              border: "none",
            }}
          />
        </div>
      </div>

      <div style={{ background: TH.bgCard, borderTop: `1px solid ${TH.border}`, padding: 10, display: "flex", flexDirection: "column", gap: 7, flexShrink: 0 }}>
        <button
          onClick={runTrace}
          disabled={isTracing}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 7,
            padding: "9px 0",
            background: isTracing ? `${TH.accent}50` : TH.accent,
            border: "none",
            borderRadius: 7,
            color: "#fff",
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: 1,
            textTransform: "uppercase",
            cursor: isTracing ? "not-allowed" : "pointer",
          }}
        >
          {isTracing ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Cpu size={14} />}
          {isTracing ? "Interpreting…" : "Trace Execution"}
        </button>

        {traceSteps && (
          <>
            <div style={{ display: "flex", gap: 5 }}>
              <button onClick={() => { setCurStep(0); setPlaying(false); }} style={ctrlBtnStyle}>
                <SkipBack size={12} />
              </button>
              <button
                onClick={() => setCurStep((p) => Math.max(0, p - 1))}
                disabled={curStep === 0}
                style={{ ...ctrlBtnStyle, flex: 1, opacity: curStep === 0 ? 0.4 : 1 }}
              >
                <ChevronLeft size={13} />PREV
              </button>
              <button
                onClick={() => setPlaying((p) => !p)}
                style={{ ...ctrlBtnStyle, flex: 1, background: playing ? `${TH.orange}18` : TH.bgRaised, color: playing ? TH.orange : TH.midText }}
              >
                {playing ? "⏸" : "▶"} {playing ? "PAUSE" : "PLAY"}
              </button>
              <button
                onClick={() => setCurStep((p) => Math.min(total - 1, p + 1))}
                disabled={curStep === total - 1}
                style={{ ...ctrlBtnStyle, flex: 1, opacity: curStep === total - 1 ? 0.4 : 1 }}
              >
                NEXT<ChevronRight size={13} />
              </button>
              <button onClick={() => { setCurStep(total - 1); setPlaying(false); }} style={ctrlBtnStyle}>
                <SkipForward size={12} />
              </button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div
                style={{ flex: 1, height: 3, background: TH.border, borderRadius: 2, cursor: "pointer", overflow: "hidden" }}
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  setCurStep(Math.min(total - 1, Math.floor(((e.clientX - r.left) / r.width) * total)));
                  setPlaying(false);
                }}
              >
                <div
                  style={{
                    width: `${((curStep + 1) / total) * 100}%`,
                    height: "100%",
                    background: TH.accent,
                    borderRadius: 2,
                    transition: "width 0.15s",
                  }}
                />
              </div>
              <span style={{ color: TH.dimText, fontSize: 10, fontFamily: "monospace", whiteSpace: "nowrap" }}>
                {curStep + 1}/{total}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
