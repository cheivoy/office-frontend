import { useState, useRef, useCallback } from "react";
import { scanInboxWithPeriod } from "../api";
import { useApi } from "../hooks";

const BASE = process.env.REACT_APP_API_URL || "";
const YEARS  = ["2025","2026","2027"];
const MONTHS = ["P01","P02","P03","P04","P05","P06","P07","P08","P09","P10","P11","P12"];

// Stable searchable employee select
function EmpSelect({ value, onChange, people }) {
  const [search, setSearch] = useState("");
  const inputRef = useRef(null);

  const grouped = people.reduce((acc, p) => {
    const key = `${p.proj||"其他"} / ${p.unit||"—"}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(p);
    return acc;
  }, {});

  const sq = search.toLowerCase();
  const filtered = Object.entries(grouped).reduce((acc, [grp, emps]) => {
    const f = sq ? emps.filter(p => (p.cn+p.en).toLowerCase().includes(sq)) : emps;
    if (f.length) acc[grp] = f;
    return acc;
  }, {});

  return (
    <div style={{width:"100%"}}>
      <input
        ref={inputRef}
        type="text"
        placeholder="🔍 搜尋員工…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        onClick={e => e.stopPropagation()}
        style={{width:"100%",fontSize:11,padding:"4px 7px",
                border:"1px solid var(--bd2)",borderRadius:"5px 5px 0 0",
                outline:"none",borderBottom:"1px solid var(--bd2)"}}
      />
      <select
        className="di"
        style={{width:"100%",fontSize:11,borderRadius:"0 0 5px 5px",
                borderTop:"none",height:72}}
        size={4}
        value={value}
        onChange={e => onChange(e.target.value)}
      >
        <option value="">— 選擇員工 —</option>
        {Object.entries(filtered).map(([grp, emps]) => (
          <optgroup key={grp} label={grp}>
            {emps.map(p => (
              <option key={p.en} value={p.en}>
                {p.cn ? `${p.cn} ${p.en}` : p.en}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}

export default function ImportModal({ onClose, show, onScanDone }) {
  const [year,        setYear]       = useState("2026");
  const [month,       setMonth]      = useState("P05");
  const [step,        setStep]       = useState("select");
  const [result,      setResult]     = useState(null);
  const [duplicates,  setDuplicates] = useState([]);
  const [pendingFiles,setPending]    = useState([]);
  const [scanResult,  setScanResult] = useState(null);
  const [movedGroups, setMovedGroups]= useState({});
  const [unmatched,   setUnmatched]  = useState([]);
  // assigns: {inbox_path: emp_en} — for both unmatched AND matched (allow override)
  const [assigns,     setAssigns]    = useState({});
  // overrides: {emp_en: new_emp_en} — allow reassigning an already-matched file
  const [overrides,   setOverrides]  = useState({});
  const [people,      setPeople]     = useState([]);
  const [inboxFiles,  setInboxFiles] = useState([]); // files still in inbox after review
  const { loading, run }             = useApi();

  const period = `${year}-${month}`;

  const loadPeople = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/api/people`);
      setPeople(await res.json());
    } catch {}
  }, []);

  const loadInboxFiles = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/api/inbox-files`);
      const data = await res.json();
      setInboxFiles(data.files || []);
    } catch {}
  }, []);

  // ── Issue 1 fix: handle both single files and folder uploads uniformly ──
  const doImport = (files) => {
    if (!files || !files.length) return;
    setStep("importing");
    const fileArr = [...files];

    // Build FormData manually to send webkitRelativePath as filename
    // This ensures single-file and folder uploads both work.
    const fd = new FormData();
    fileArr.forEach(f => {
      // For folder uploads, use relative path; for single files, just the name
      const name = f.webkitRelativePath || f.name;
      fd.append("files", f, name);
    });

    const doFetch = () => fetch(`${BASE}/api/import-files`, { method: "POST", body: fd })
      .then(r => { if (!r.ok) throw new Error(r.statusText); return r.json(); });

    run(
      doFetch,
      res => {
        setResult(res);
        if (res.duplicates && res.duplicates.length > 0) {
          setDuplicates(res.duplicates);
          setPending(fileArr.filter(f =>
            res.duplicates.some(d =>
              d.filename === (f.webkitRelativePath || f.name)
            )
          ));
          setStep("duplicates");
        } else {
          doScan();
        }
      },
      e => { show(`導入失敗：${e}`, "err"); setStep("select"); }
    );
  };

  const forceImport = () => {
    if (!pendingFiles.length) { doScan(); return; }
    const fd = new FormData();
    pendingFiles.forEach(f => {
      const name = f.webkitRelativePath || f.name;
      fd.append("files", f, name);
    });
    const doFetch = () => fetch(`${BASE}/api/import-files-force`, { method: "POST", body: fd })
      .then(r => { if (!r.ok) throw new Error(r.statusText); return r.json(); });
    run(doFetch, () => doScan(), e => show(`強制導入失敗：${e}`, "err"));
  };

  const doScan = () => {
    setStep("scanning");
    run(
      () => scanInboxWithPeriod(period),
      res => {
        setScanResult(res);
        const groups = {};
        (res.moved || []).forEach(m => {
          const key = m.emp_en || m.emp;
          if (!groups[key]) groups[key] = { emp_cn: m.emp_cn||"", files: [] };
          groups[key].files.push(m);
        });
        setMovedGroups(groups);
        setUnmatched(res.unmatched || []);
        loadPeople();
        // Always load inbox remainder so "稍後處理" users can find files again
        loadInboxFiles();
        setStep("review");
      },
      e => { show(`掃描失敗：${e}`, "err"); setStep("select"); }
    );
  };

  const confirmReview = async () => {
    const promises = [];

    // Manual assigns for unmatched files
    Object.entries(assigns)
      .filter(([,emp]) => emp)
      .forEach(([inbox_path, emp_name]) => {
        const fd = new FormData();
        fd.append("inbox_path", inbox_path);
        fd.append("emp_name",   emp_name);
        fd.append("period",     period);
        promises.push(fetch(`${BASE}/api/assign-manual`, { method:"POST", body:fd }));
      });

    // Overrides: reassign already-matched files to a different employee
    // We do this via move-file API
    for (const [origEmpEn, newEmpEn] of Object.entries(overrides)) {
      if (!newEmpEn || newEmpEn === origEmpEn) continue;
      const grp = movedGroups[origEmpEn];
      if (!grp) continue;
      for (const f of grp.files) {
        const fd = new FormData();
        fd.append("emp_en",       origEmpEn);
        fd.append("file_path",    f.dest.split("/").pop()); // just filename
        fd.append("target_emp",   newEmpEn);
        fd.append("target_period", period);
        fd.append("do_copy",      "false");
        promises.push(fetch(`${BASE}/api/move-file`, { method:"POST", body:fd }));
      }
    }

    if (promises.length) await Promise.all(promises);
    setStep("done");
    onScanDone && onScanDone(scanResult);
    show("歸檔完成", "ok");
  };

  const FILE_TYPE_LABEL = {
    task_report:"Task Report", tr_approval:"TR Approval",
    ess_approval:"ESS Approval", ot_approval:"OT Approval",
    ns_approval:"NS Approval", travel_apply:"差旅申請",
    travel_approval:"差旅Approval", leave_approval:"請假Approval",
    other:"其他",
  };
  const TYPE_COLOR = {
    task_report:"#3B6D11",tr_approval:"#185FA5",ess_approval:"#185FA5",
    ot_approval:"#8A5A00",ns_approval:"#7B3F9E",travel_apply:"#993C1D",
    travel_approval:"#993C1D",leave_approval:"#2E6B14",other:"#888",
  };

  return (
    <div className="modal-overlay">
      <div className="modal" style={{maxWidth:560}}>
        <div className="modal-hd">
          <span className="modal-hd-t">
            📂 導入檔案
            {step==="review"&&` — ${period} 歸檔結果`}
          </span>
          <button className="btn sm" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body" style={{maxHeight:"60vh",overflowY:"auto"}}>

          {/* ── SELECT ── */}
          {step==="select" && <>
            <div style={{marginBottom:12}}>
              <div style={{fontSize:11,color:"#8AB2D8",marginBottom:6}}>選擇月份</div>
              <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:8}}>
                <select className="di" value={year} onChange={e=>setYear(e.target.value)}
                        style={{fontSize:12,padding:"4px 8px"}}>
                  {YEARS.map(y=><option key={y} value={y}>{y}</option>)}
                </select>
                <span style={{fontSize:12,color:"#8AB2D8"}}>年</span>
              </div>
              <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                {MONTHS.map(m=>(
                  <button key={m} className={`chip ${month===m?"on":""}`}
                          style={{padding:"3px 10px"}} onClick={()=>setMonth(m)}>{m}</button>
                ))}
              </div>
              <div style={{marginTop:6,fontSize:11,color:"var(--ok-tx)",background:"var(--ok-bg)",
                           border:"1px solid #90CF60",borderRadius:6,padding:"4px 8px",
                           display:"inline-block"}}>
                歸檔至：{period}
              </div>
            </div>
            <div style={{display:"flex",gap:8}}>
              {/* Single file upload */}
              <label style={{flex:1,border:"1.5px dashed var(--bd2)",borderRadius:8,padding:14,
                             textAlign:"center",cursor:"pointer",fontSize:12,color:"#888"}}>
                <div style={{fontSize:22,marginBottom:4}}>📄</div>
                <div style={{fontWeight:500,color:"var(--b800)"}}>選擇多個檔案</div>
                <div style={{fontSize:11}}>PDF / xlsx / eml</div>
                <input type="file" multiple style={{display:"none"}}
                       onChange={e => doImport(e.target.files)}/>
              </label>
              {/* Folder upload */}
              <label style={{flex:1,border:"1.5px dashed var(--bd2)",borderRadius:8,padding:14,
                             textAlign:"center",cursor:"pointer",fontSize:12,color:"#888"}}>
                <div style={{fontSize:22,marginBottom:4}}>🗂</div>
                <div style={{fontWeight:500,color:"var(--b800)"}}>選擇資料夾</div>
                <div style={{fontSize:11}}>資料夾名稱比對員工</div>
                <input type="file" style={{display:"none"}} webkitdirectory=""
                       onChange={e => doImport(e.target.files)}/>
              </label>
            </div>

            {/* Issue 4: Show inbox reminder if there are leftover files */}
            {inboxFiles.length > 0 && (
              <div style={{marginTop:12,padding:"8px 10px",background:"var(--warn-bg)",
                           border:"1px solid #F0D080",borderRadius:7,fontSize:11,
                           color:"var(--warn-tx)"}}>
                📥 Inbox 中還有 <strong>{inboxFiles.length}</strong> 個未處理檔案（稍後處理的）。
                <button className="btn sm" style={{marginLeft:8,fontSize:10,padding:"2px 8px"}}
                        onClick={doScan}>重新掃描</button>
              </div>
            )}
          </>}

          {/* ── IMPORTING / SCANNING ── */}
          {(step==="importing"||step==="scanning") && (
            <Loading msg={step==="importing"?"導入中…":`掃描歸檔到 ${period}…`}
                     sub={step==="importing"?"上傳檔案到 Inbox":"比對員工姓名中"}/>
          )}

          {/* ── DUPLICATES ── */}
          {step==="duplicates" && <>
            <div style={{fontSize:12,color:"var(--warn-tx)",background:"var(--warn-bg)",
                         border:"1px solid #F0D080",borderRadius:7,padding:"8px 10px",marginBottom:10}}>
              ⚠️ 以下 {duplicates.length} 個檔案已存在，確定覆蓋嗎？
            </div>
            {duplicates.map((d,i)=>(
              <div key={i} style={{fontSize:11,padding:"4px 6px",borderBottom:"1px solid var(--bd)",
                                   wordBreak:"break-all",lineHeight:1.5}}>
                📄 {d.filename}
                {d.size_match&&<span style={{color:"#8AB2D8",marginLeft:6}}>(內容相同)</span>}
              </div>
            ))}
          </>}

          {/* ── REVIEW ── */}
          {step==="review" && <>
            {/* Matched files grouped by employee — with optional override */}
            {Object.keys(movedGroups).length > 0 && <>
              <div style={{fontSize:11,fontWeight:500,color:"var(--b800)",marginBottom:8}}>
                ✅ 已自動歸檔 {Object.values(movedGroups).reduce((a,g)=>a+g.files.length,0)} 個檔案：
              </div>
              {Object.entries(movedGroups).map(([empEn, grp]) => (
                <div key={empEn} style={{marginBottom:8,border:"1px solid var(--bd)",
                                         borderRadius:7,overflow:"hidden"}}>
                  <div style={{background:"var(--b50)",padding:"5px 10px",fontSize:12,
                               fontWeight:500,color:"var(--b800)",display:"flex",
                               alignItems:"center",gap:6}}>
                    👤 {grp.emp_cn ? `${grp.emp_cn} ${empEn}` : empEn}
                    <span style={{fontSize:10,color:"#8AB2D8",marginLeft:"auto"}}>
                      {grp.files.length} 個檔案
                    </span>
                  </div>
                  {grp.files.map((f,i) => (
                    <div key={i} style={{display:"flex",alignItems:"center",gap:6,
                                         padding:"4px 10px",borderTop:i>0?"1px solid var(--bd)":"none",
                                         fontSize:11}}>
                      <span style={{fontSize:10,padding:"1px 5px",borderRadius:4,flexShrink:0,
                                    background:`${TYPE_COLOR[f.type]}22`,color:TYPE_COLOR[f.type],
                                    fontWeight:500}}>
                        {FILE_TYPE_LABEL[f.type]||f.type}
                      </span>
                      <span style={{flex:1,wordBreak:"break-all",lineHeight:1.4,color:"#555"}}>
                        {f.file}
                      </span>
                    </div>
                  ))}
                  {/* Issue 3: allow reassigning matched files */}
                  <div style={{padding:"6px 10px",borderTop:"1px solid var(--bd)",
                               background:"#FAFCFF"}}>
                    <div style={{fontSize:10,color:"#8AB2D8",marginBottom:4}}>
                      🔀 重新指定歸檔人員（可選）：
                    </div>
                    <EmpSelect
                      value={overrides[empEn]||""}
                      onChange={v => setOverrides(p=>({...p,[empEn]:v}))}
                      people={people.filter(p => p.en !== empEn)}
                    />
                  </div>
                </div>
              ))}
            </>}

            {/* Unmatched - manual assign (required) */}
            {unmatched.length > 0 && <>
              <div style={{fontSize:11,fontWeight:500,color:"var(--warn-tx)",
                           marginBottom:8,marginTop:12,
                           background:"var(--warn-bg)",border:"1px solid #F0D080",
                           borderRadius:7,padding:"7px 10px"}}>
                ⚠️ {unmatched.length} 個檔案無法自動識別，請指定歸檔人員（或稍後處理）：
              </div>
              {unmatched.map((u,i) => (
                <div key={i} style={{marginBottom:8,padding:"8px",background:"var(--b50)",
                                     border:"1px solid var(--bd)",borderRadius:7}}>
                  <div style={{fontSize:11,wordBreak:"break-all",lineHeight:1.5,
                               marginBottom:6,color:"var(--b800)"}}>
                    📄 {u.file}
                  </div>
                  {/* Issue 3: full employee selector for unmatched */}
                  <EmpSelect
                    value={assigns[u.inbox_path]||""}
                    onChange={v => setAssigns(p=>({...p,[u.inbox_path]:v}))}
                    people={people}
                  />
                </div>
              ))}
            </>}

            {Object.keys(movedGroups).length===0 && unmatched.length===0 && (
              <div style={{textAlign:"center",padding:20,color:"#888",fontSize:12}}>
                Inbox 中沒有新檔案
              </div>
            )}
          </>}

          {/* ── DONE ── */}
          {step==="done" && (
            <div style={{textAlign:"center",padding:"20px 0"}}>
              <div style={{fontSize:40,marginBottom:8}}>✅</div>
              <div style={{fontSize:14,fontWeight:500,color:"var(--b800)",marginBottom:8}}>
                歸檔完成
              </div>
              {result&&<div style={{fontSize:12,color:"#555",marginBottom:4}}>
                上傳 {result.count} 個
                {result.skipped?.length>0&&`，跳過重複 ${result.skipped.length} 個`}
              </div>}
              {scanResult&&<div style={{fontSize:12,color:"#555"}}>
                自動歸檔 {scanResult.moved?.length||0} 個
              </div>}
              {/* Issue 4: Show if files remain in inbox */}
              {unmatched.length > 0 && (
                Object.keys(assigns).filter(k=>assigns[k]).length < unmatched.length
              ) && (
                <div style={{marginTop:10,fontSize:11,color:"var(--warn-tx)",
                             background:"var(--warn-bg)",border:"1px solid #F0D080",
                             borderRadius:6,padding:"6px 10px"}}>
                  📥 部分檔案已留在 Inbox，下次點「導入」時會提示重新掃描。
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-footer">
          {step==="select"     && <button className="btn" onClick={onClose}>取消</button>}
          {step==="duplicates" && <>
            <button className="btn" onClick={()=>{setDuplicates([]);setPending([]);doScan();}}>
              跳過重複
            </button>
            <button className="btn blue" onClick={forceImport} disabled={loading}>
              {loading?<span className="spinner"/>:"⚠️"} 覆蓋並繼續
            </button>
          </>}
          {step==="review" && <>
            {/* Issue 4: 稍後處理 now keeps files in inbox and explains */}
            <button className="btn" onClick={() => {
              setStep("done");
              show("未指定的檔案保留在 Inbox，下次導入時可繼續處理", "info");
            }}>稍後處理</button>
            <button className="btn blue" onClick={confirmReview} disabled={loading}>
              {loading?<span className="spinner"/>:"✓"} 確認完成
            </button>
          </>}
          {step==="done" && <button className="btn blue" onClick={onClose}>關閉</button>}
        </div>
      </div>
    </div>
  );
}

function Loading({ msg, sub }) {
  return (
    <div style={{textAlign:"center",padding:"32px 16px"}}>
      <div style={{marginBottom:16}}>
        <div style={{display:"inline-block",width:40,height:40,
                     border:"3px solid var(--b100)",borderTopColor:"var(--b600)",
                     borderRadius:"50%",animation:"spin .8s linear infinite"}}/>
      </div>
      <div style={{fontSize:13,fontWeight:500,color:"var(--b800)",marginBottom:4}}>{msg}</div>
      <div style={{fontSize:11,color:"#8AB2D8"}}>{sub}</div>
    </div>
  );
}
