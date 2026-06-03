import { useState, useRef, useCallback } from "react";
import { importFiles, importFilesForce, scanInboxWithPeriod } from "../api";
import { useApi } from "../hooks";

const BASE = process.env.REACT_APP_API_URL || "";
const YEARS  = ["2025","2026","2027"];
const MONTHS = ["P01","P02","P03","P04","P05","P06","P07","P08","P09","P10","P11","P12"];

// Stable searchable employee select - avoids re-render losing focus
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
  const [year,       setYear]       = useState("2026");
  const [month,      setMonth]      = useState("P05");
  const [step,       setStep]       = useState("select");
  const [result,     setResult]     = useState(null);
  const [duplicates, setDuplicates] = useState([]);
  const [pendingFiles,setPending]   = useState([]);
  const [scanResult, setScanResult] = useState(null);
  // scan review: moved grouped + unmatched
  const [movedGroups,setMovedGroups]= useState({});  // {emp_en: [{file,type,dest,...}]}
  const [unmatched,  setUnmatched]  = useState([]);
  const [assigns,    setAssigns]    = useState({});   // {inbox_path: emp_en}
  const [people,     setPeople]     = useState([]);
  const { loading, run }            = useApi();

  const period = `${year}-${month}`;

  const loadPeople = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/api/people`);
      setPeople(await res.json());
    } catch {}
  }, []);

  const doImport = (files) => {
    if (!files.length) return;
    setStep("importing");
    const fileArr = [...files];
    run(
      () => importFiles(fileArr),
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
    run(() => importFilesForce(pendingFiles), () => doScan(),
        e => show(`強制導入失敗：${e}`, "err"));
  };

  const doScan = () => {
    setStep("scanning");
    run(
      () => scanInboxWithPeriod(period),
      res => {
        setScanResult(res);
        // Group moved files by employee
        const groups = {};
        (res.moved || []).forEach(m => {
          const key = m.emp_en || m.emp;
          if (!groups[key]) groups[key] = { emp_cn: m.emp_cn||"", files: [] };
          groups[key].files.push(m);
        });
        setMovedGroups(groups);
        setUnmatched(res.unmatched || []);
        if ((res.unmatched||[]).length > 0) loadPeople();
        setStep("review");  // always show review
      },
      e => { show(`掃描失敗：${e}`, "err"); setStep("select"); }
    );
  };

  const confirmReview = async () => {
    // Send manual assignments
    const promises = Object.entries(assigns)
      .filter(([,emp]) => emp)
      .map(([inbox_path, emp_name]) => {
        const fd = new FormData();
        fd.append("inbox_path", inbox_path);
        fd.append("emp_name",   emp_name);
        fd.append("period",     period);
        return fetch(`${BASE}/api/assign-manual`, { method:"POST", body:fd });
      });
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
              <label style={{flex:1,border:"1.5px dashed var(--bd2)",borderRadius:8,padding:14,
                             textAlign:"center",cursor:"pointer",fontSize:12,color:"#888"}}>
                <div style={{fontSize:22,marginBottom:4}}>📄</div>
                <div style={{fontWeight:500,color:"var(--b800)"}}>選擇多個檔案</div>
                <div style={{fontSize:11}}>PDF / xlsx / eml</div>
                <input type="file" multiple style={{display:"none"}}
                       onChange={e=>doImport(e.target.files)}/>
              </label>
              <label style={{flex:1,border:"1.5px dashed var(--bd2)",borderRadius:8,padding:14,
                             textAlign:"center",cursor:"pointer",fontSize:12,color:"#888"}}>
                <div style={{fontSize:22,marginBottom:4}}>🗂</div>
                <div style={{fontWeight:500,color:"var(--b800)"}}>選擇資料夾</div>
                <div style={{fontSize:11}}>資料夾名稱比對員工</div>
                <input type="file" style={{display:"none"}} webkitdirectory=""
                       onChange={e=>doImport(e.target.files)}/>
              </label>
            </div>
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
            {/* Matched files grouped by employee */}
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
                </div>
              ))}
            </>}

            {/* Unmatched - manual assign */}
            {unmatched.length > 0 && <>
              <div style={{fontSize:11,fontWeight:500,color:"var(--warn-tx)",
                           marginBottom:8,marginTop:12,
                           background:"var(--warn-bg)",border:"1px solid #F0D080",
                           borderRadius:7,padding:"7px 10px"}}>
                ⚠️ {unmatched.length} 個檔案無法自動識別，請手動指定員工：
              </div>
              {unmatched.map((u,i) => (
                <div key={i} style={{marginBottom:8,padding:"8px",background:"var(--b50)",
                                     border:"1px solid var(--bd)",borderRadius:7}}>
                  <div style={{fontSize:11,wordBreak:"break-all",lineHeight:1.5,
                               marginBottom:6,color:"var(--b800)"}}>
                    📄 {u.file}
                  </div>
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
            <button className="btn" onClick={onClose}>稍後處理</button>
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
