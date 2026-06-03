import { useState, useEffect } from "react";
import { getPeriods, downloadFiltered, downloadBlob } from "../api";
import { useApi } from "../hooks";

export default function DownloadModal({ allEmps, onClose, show }) {
  const [q,        setQ]        = useState("");
  const [period,   setPeriod]   = useState("");
  const [periods,  setPeriods]  = useState([]);
  const [selected, setSelected] = useState(new Set());
  const { loading, run }        = useApi();

  useEffect(() => {
    getPeriods().then(r => setPeriods(r.periods || [])).catch(() => {});
  }, []);

  const filtered = allEmps.filter(e => {
    if (!q) return true;
    const ql = q.toLowerCase();
    return (e.cn + e.en).toLowerCase().includes(ql) ||
           (e.unit || "").toLowerCase().includes(ql) ||
           (e.proj || "").toLowerCase().includes(ql);
  });

  const toggleAll = () => {
    if (selected.size === filtered.length)
      setSelected(new Set());
    else
      setSelected(new Set(filtered.map(e => e.id)));
  };

  const doDownload = (singleEmp = null) => {
    const ids = singleEmp
      ? String(singleEmp.id)
      : [...selected].join(",");
    if (!ids && !q) { show("請選擇員工或輸入搜尋條件", "err"); return; }
    run(
      () => downloadFiltered(singleEmp ? "" : q, period, ids),
      blob => {
        const name = singleEmp
          ? `${singleEmp.en}_${period || "all"}.zip`
          : `download_${period || "all"}.zip`;
        downloadBlob(blob, name);
        show("下載中…", "ok");
      },
      e => show(`下載失敗：${e}`, "err")
    );
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal wide">
        <div className="modal-hd">
          <span className="modal-hd-t">⬇ 下載檔案</span>
          <button className="btn sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{padding:0}}>

          {/* Filters */}
          <div style={{padding:"10px 14px",borderBottom:"1px solid var(--bd)",
                       display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
            <div style={{position:"relative",flex:1,minWidth:140}}>
              <input value={q} onChange={e=>setQ(e.target.value)}
                     placeholder="搜尋姓名 / 單位 / 專案…"
                     style={{width:"100%",fontSize:12,padding:"5px 8px 5px 24px",
                             border:"1px solid var(--bd2)",borderRadius:6,outline:"none"}}/>
              <span style={{position:"absolute",left:8,top:"50%",transform:"translateY(-50%)",
                            fontSize:12,color:"#8AB2D8",pointerEvents:"none"}}>🔍</span>
            </div>
            <select className="di" value={period} onChange={e=>setPeriod(e.target.value)}
                    style={{fontSize:12,padding:"5px 8px"}}>
              <option value="">全部月份</option>
              {periods.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <button className="btn sm blue" onClick={()=>doDownload()}
                    disabled={loading || selected.size===0}>
              {loading ? <span className="spinner"/> : "⬇"}
              {" "}批量下載 {selected.size > 0 ? `(${selected.size})` : ""}
            </button>
          </div>

          {/* Table */}
          <div style={{overflow:"auto",maxHeight:380}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead>
                <tr>
                  <th style={{width:36,padding:"6px 8px",background:"var(--b50)",
                              borderBottom:"1px solid var(--bd)",textAlign:"center"}}>
                    <input type="checkbox"
                           checked={selected.size===filtered.length && filtered.length>0}
                           onChange={toggleAll} style={{accentColor:"var(--b600)"}}/>
                  </th>
                  {["姓名","專案","單位","PM","月份資料夾"].map(h=>(
                    <th key={h} style={{padding:"6px 8px",background:"var(--b50)",
                                       borderBottom:"1px solid var(--bd)",
                                       textAlign:"left",fontWeight:500,
                                       fontSize:11,color:"var(--b800)"}}>
                      {h}
                    </th>
                  ))}
                  <th style={{width:60,padding:"6px 8px",background:"var(--b50)",
                              borderBottom:"1px solid var(--bd)"}}/>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={7} style={{textAlign:"center",padding:20,color:"#888"}}>
                    查無符合條件的員工
                  </td></tr>
                )}
                {filtered.map(e => (
                  <tr key={e.id} style={{cursor:"pointer"}}
                      onClick={()=>{
                        const s=new Set(selected);
                        s.has(e.id)?s.delete(e.id):s.add(e.id);
                        setSelected(s);
                      }}>
                    <td style={{textAlign:"center",padding:"5px 8px",
                                borderBottom:"1px solid var(--bd)"}}>
                      <input type="checkbox" checked={selected.has(e.id)}
                             onChange={()=>{}} style={{accentColor:"var(--b600)"}}/>
                    </td>
                    <td style={{padding:"5px 8px",borderBottom:"1px solid var(--bd)"}}>
                      <div style={{fontWeight:500}}>{e.cn||e.en}</div>
                      {e.cn&&e.en&&<div style={{fontSize:11,color:"#888"}}>{e.en}</div>}
                    </td>
                    <td style={{padding:"5px 8px",borderBottom:"1px solid var(--bd)"}}>
                      <span style={{fontSize:10,padding:"2px 7px",borderRadius:20,
                                    background:"var(--b100)",color:"var(--b800)",fontWeight:500}}>
                        {e.proj}
                      </span>
                    </td>
                    <td style={{padding:"5px 8px",borderBottom:"1px solid var(--bd)",
                                fontSize:11,color:"#555"}}>{e.unit||"—"}</td>
                    <td style={{padding:"5px 8px",borderBottom:"1px solid var(--bd)",
                                fontSize:11,color:"#555"}}>{e.pm||"—"}</td>
                    <td style={{padding:"5px 8px",borderBottom:"1px solid var(--bd)"}}>
                      {(e.periods||[]).length > 0
                        ? <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
                            {(e.periods||[]).map(p=>(
                              <span key={p} style={{fontSize:10,padding:"1px 6px",
                                                   borderRadius:10,background:"var(--b50)",
                                                   border:"1px solid var(--bd2)",color:"var(--b800)"}}>
                                {p}
                              </span>
                            ))}
                          </div>
                        : <span style={{fontSize:11,color:"#888"}}>—</span>
                      }
                    </td>
                    <td style={{padding:"5px 8px",borderBottom:"1px solid var(--bd)",
                                textAlign:"center"}}>
                      <button className="btn sm" onClick={ev=>{ev.stopPropagation();doDownload(e);}}>
                        ⬇
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{padding:"8px 14px",borderTop:"1px solid var(--bd)",
                       fontSize:11,color:"#888"}}>
            共 {filtered.length} 人　已選 {selected.size} 人
          </div>
        </div>
      </div>
    </div>
  );
}
