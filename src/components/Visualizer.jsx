import { TH } from "../theme";

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function VarCell({name, val, changed, addr}){
  const isArr=Array.isArray(val);
  const isStruct=val&&typeof val==="object"&&val.__type==="struct";
  const isPtr=!isArr&&!isStruct&&typeof val==="number"&&val>=256&&val<0x10000;
  const disp=isArr?`[${val.length}]`
    :isStruct?"struct"
    :typeof val==="number"?(isPtr?`->0x${val.toString(16)}`:(val===0&&isPtr?"NULL":(Number.isInteger(val)?String(val):val.toFixed(3))))
    :typeof val==="string"?`"${val.slice(0,10)}${val.length>10?"...":""}"`:"?";

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
                {typeof v==="number"&&v>=256?`->0x${v.toString(16)}`:String(v)}
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
            {typeof v==="number"&&v>=256?`->0x${v.toString(16)}`:v===0?"NULL":String(v)}
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
                {idx<nodes.length-1&&<span style={{color:TH.accent,fontSize:16,fontWeight:800}}>-&gt;</span>}
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
          {step.stdout||<span style={{fontStyle:"italic",color:TH.dimText}}>no output yet...</span>}
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


export default Viz;
