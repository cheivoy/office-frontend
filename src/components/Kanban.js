import { useState, useEffect, useCallback } from "react";
import { scanInbox, importFiles } from "../api";
import { useToast, useApi } from "../hooks";
import RightPanel from "./RightPanel";

const COLS = [
  { id: "tr",     label: "TR",   subs: [{ id: "task_report", label: "Task Report" }, { id: "tr_approval", label: "TR Approval" }] },
  { id: "ess",    label: "ESS",  subs: [{ id: "ess_approval", label: "ESS Approval" }] },
  { id: "ot",     label: "OT",   subs: [{ id: "ot_approval",  label: "OT Approval"  }] },
  { id: "ns",     label: "NS",   subs: [{ id: "ns_approval",  label: "NS Approval"  }] },
  { id: "travel", label: "差旅", subs: [{ id: "travel_apply", label: "差旅申請" }, { id: "travel_approval", label: "差旅Approval" }] },
  { id: "leave",  label: "請假", subs: [{ id: "leave_approval", label: "請假Approval" }] },
];
const STATUS_CYCLE = ["ok", "miss", "na"];
const mkForm = () => ({ workdays: "", ess: [], ot: [], ta: [], leave: [] });

export default function Kanban() {
  const [kanban, setKanban]         = useState([]);
  const [activeG, setActiveG]       = useState(new Set(["tr"]));
  const [tst, setTst]               = useState({});
  const [filt, setFilt]             = useState({ proj: null, unit: null, pm: null });
  const [q, setQ]                   = useState("");
  const [sortMode, setSortMode]     = useState("name");
  const [df, setDf]                 = useState("");
  const [dt, setDt]                 = useState("");
  const [selId, setSelId]           = useState(null);
  const [curRT, setCurRT]           = useState("files");
  const [forms, setForms]           = useState({});
  const [statuses, setStatuses]     = useState({});
  const { show, Toast }             = useToast();
  const { loading, run }            = useApi();

  // Initial scan on mount
  useEffect(() => { handleScan(); }, []); // eslint-disable-line

  const handleScan = () => {
    run(
      () => scanInbox(),
      (res) => {
        setKanban(res.kanban || []);
        show(`掃描完成，共 ${(res.moved || []).length} 個檔案已分類`);
      },
      (e) => show(`掃描失敗：${e}`, "err")
    );
  };

  const handleImport = (e) => {
    const files = [...e.target.files];
    if (!files.length) return;
    run(
      () => importFiles(files),
      (res) => show(`已導入 ${res.count} 個檔案到 Inbox，請按掃描`),
      (e) => show(`導入失敗：${e}`, "err")
    );
  };

  const getFlat = useCallback(() => {
    const r = [];
    COLS.forEach(g => { if (activeG.has(g.id)) r.push(...g.subs); });
    return r;
  }, [activeG]);

  const getList = useCallback(() => {
    let list = kanban.slice();
    if (filt.proj) list = list.filter(e => e.proj === filt.proj);
    if (filt.unit) list = list.filter(e => (e.unit || "—") === filt.unit);
    if (filt.pm)   list = list.filter(e => e.pm === filt.pm);
    if (q) { const ql = q.toLowerCase(); list = list.filter(e => (e.cn + e.en).toLowerCase().includes(ql)); }
    if (df) list = list.filter(e => e.uploadDate >= df);
    if (dt) list = list.filter(e => e.uploadDate <= dt);
    if (sortMode === "name") list.sort((a, b) => (a.cn || a.en).localeCompare(b.cn || b.en, "zh"));
    else if (sortMode === "date-asc")  list.sort((a, b) => (a.uploadDate || "").localeCompare(b.uploadDate || ""));
    else list.sort((a, b) => (b.uploadDate || "").localeCompare(a.uploadDate || ""));
    return list;
  }, [kanban, filt, q, df, dt, sortMode]);

  const buildTree = () => {
    const t = {};
    kanban.forEach(e => {
      if (!t[e.proj]) t[e.proj] = {};
      const u = e.unit || "—";
      if (!t[e.proj][u]) t[e.proj][u] = new Set();
      if (e.pm) t[e.proj][u].add(e.pm);
    });
    return t;
  };
  const tree = buildTree();

  const cycleStatus = (e, eid, col) => {
    e.stopPropagation();
    setStatuses(prev => {
      const emp = kanban.find(x => x.id === eid);
      const cur = (prev[eid] || emp?.status || {})[col] || "na";
      const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(cur) + 1) % STATUS_CYCLE.length];
      return { ...prev, [eid]: { ...(prev[eid] || emp?.status || {}), [col]: next } };
    });
  };

  const getStatus = (emp, col) => (statuses[emp.id] || emp.status || {})[col] || "na";

  const flat = getFlat();
  const list = getList();
  const selEmp = kanban.find(e => e.id === selId);

  // stats
  const okCount   = list.reduce((a, e) => a + flat.filter(s => getStatus(e, s.id) === "ok").length,   0);
  const missCount = list.reduce((a, e) => a + flat.filter(s => getStatus(e, s.id) === "miss").length, 0);

  const clickP  = p  => { setTst(p => ({ ...p, [p]: !p[p] })); setFilt({ proj: p,    unit: null, pm: null }); };
  const clickU  = (p, u) => { setTst(prev => ({ ...prev, [`${p}:${u}`]: !prev[`${p}:${u}`] })); setFilt({ proj: p, unit: u, pm: null }); };
  const clickPM = (p, u, pm) => setFilt({ proj: p, unit: u, pm });

  const updateForm = (eid, newForm) => setForms(prev => ({ ...prev, [eid]: newForm }));
  const getForm    = (eid) => forms[eid] || mkForm();

  const grouped = !filt.unit && !filt.pm && !q && !df && !dt;

  return (
    <div className="kanban-layout">
      {/* ── Sidebar ── */}
      <div className="sidebar">
        <div className="search-wrap">
          <span className="search-icon">🔍</span>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="搜尋姓名..." />
        </div>
        <div className="tree">
          {Object.keys(tree).map(proj => (
            <div key={proj}>
              <div className={`tree-proj ${filt.proj === proj && !filt.unit ? "sel" : ""}`}
                   onClick={() => clickP(proj)}>
                <span className={`chv ${tst[proj] ? "open" : ""}`}>▶</span>
                📁 {proj}
              </div>
              {tst[proj] && Object.keys(tree[proj]).map(u => (
                <div key={u}>
                  <div className={`tree-unit ${filt.proj === proj && filt.unit === u && !filt.pm ? "sel" : ""}`}
                       onClick={() => clickU(proj, u)}>
                    {[...tree[proj][u]].length > 0 && <span className={`chv ${tst[`${proj}:${u}`] ? "open" : ""}`}>▶</span>}
                    🏢 {u}
                  </div>
                  {tst[`${proj}:${u}`] && [...tree[proj][u]].map(pm => (
                    <div key={pm}
                         className={`tree-pm ${filt.pm === pm ? "sel" : ""}`}
                         onClick={() => clickPM(proj, u, pm)}>
                      👤 {pm}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ── Main ── */}
      <div className="main-area">
        <div className="toolbar">
          <span className="toolbar-title">
            {filt.pm ? `${filt.pm} (${filt.unit})` : filt.unit ? `${filt.proj} / ${filt.unit}` : filt.proj || "全部員工"}
            （{list.length} 人）
          </span>
          <span className="pill">{okCount} 已繳</span>
          <span className="pill red">{missCount} 缺件</span>
          <label className="btn" style={{ cursor: "pointer" }}>
            📂 導入檔案
            <input type="file" multiple style={{ display: "none" }} onChange={handleImport} />
          </label>
          <button className="btn blue" onClick={handleScan} disabled={loading}>
            {loading ? <span className="spinner" /> : "🔄"} 掃描 Inbox
          </button>
        </div>

        <div className="colbar">
          <span className="colbar-label">掃描欄位：</span>
          {COLS.map(g => (
            <span key={g.id}
                  className={`chip ${activeG.has(g.id) ? "on" : ""}`}
                  onClick={() => setActiveG(prev => {
                    const s = new Set(prev);
                    if (s.has(g.id)) { if (s.size > 1) s.delete(g.id); }
                    else s.add(g.id);
                    return s;
                  })}>
              {g.label}
            </span>
          ))}
        </div>

        <div className="sortbar">
          <span style={{ fontSize: 11, color: "#8AB2D8" }}>排序：</span>
          {[["name","姓名"],["date-asc","日期↑"],["date-desc","日期↓"]].map(([m, lbl]) => (
            <button key={m} className={`sort-btn ${sortMode === m ? "on" : ""}`}
                    onClick={() => setSortMode(m)}>{lbl}</button>
          ))}
          <div className="vsep" />
          <span style={{ fontSize: 11, color: "#8AB2D8" }}>範圍：</span>
          <input className="date-input" type="date" value={df} onChange={e => setDf(e.target.value)} />
          <span style={{ fontSize: 11, color: "#8AB2D8" }}>—</span>
          <input className="date-input" type="date" value={dt} onChange={e => setDt(e.target.value)} />
          {(df || dt) && <button className="sort-btn" onClick={() => { setDf(""); setDt(""); }}>✕</button>}
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="nc">姓名</th>
                <th className="dc">上傳日期</th>
                {flat.map(s => <th key={s.id} style={{ width: Math.max(60, 110 / flat.length) }}>{s.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {grouped ? (() => {
                const grps = {};
                list.forEach(e => {
                  const k = `${e.proj}||${e.unit || "—"}||${e.pm || ""}`;
                  if (!grps[k]) grps[k] = { proj: e.proj, unit: e.unit || "—", pm: e.pm || "", emps: [] };
                  grps[k].emps.push(e);
                });
                let lp = "", lu = "";
                return Object.values(grps).flatMap(g => {
                  const rows = [];
                  if (g.proj !== lp) { rows.push(<tr key={`gp-${g.proj}`} className="gp"><td colSpan={flat.length + 2}>📁 {g.proj}</td></tr>); lp = g.proj; lu = ""; }
                  if (g.unit !== lu) { rows.push(<tr key={`gu-${g.proj}-${g.unit}`} className="gu"><td colSpan={flat.length + 2}>└ {g.unit}</td></tr>); lu = g.unit; }
                  if (g.pm) rows.push(<tr key={`gpm-${g.pm}`} className="gpm"><td colSpan={flat.length + 2}>· PM: {g.pm}</td></tr>);
                  g.emps.forEach(e => rows.push(
                    <tr key={e.id} className={`er ${selId === e.id ? "sel" : ""}`} onClick={() => setSelId(e.id)}>
                      <td className="nc"><div className="ecn">{e.cn || e.en}</div>{e.cn && e.en && <div className="een">{e.en}</div>}</td>
                      <td style={{ fontSize: 11, color: "#888", textAlign: "center" }}>{e.uploadDate}</td>
                      {flat.map(s => { const st = getStatus(e, s.id); return (
                        <td key={s.id}><span className={`bdg ${st}`} onClick={ev => cycleStatus(ev, e.id, s.id)}>
                          <span className={`dot ${st}`} />{st === "ok" ? "已繳" : st === "miss" ? "缺件" : "—"}
                        </span></td>
                      ); })}
                    </tr>
                  ));
                  return rows;
                });
              })() : list.map(e => (
                <tr key={e.id} className={`er ${selId === e.id ? "sel" : ""}`} onClick={() => setSelId(e.id)}>
                  <td className="nc"><div className="ecn">{e.cn || e.en}</div>{e.cn && e.en && <div className="een">{e.en}</div>}</td>
                  <td style={{ fontSize: 11, color: "#888", textAlign: "center" }}>{e.uploadDate}</td>
                  {flat.map(s => { const st = getStatus(e, s.id); return (
                    <td key={s.id}><span className={`bdg ${st}`} onClick={ev => cycleStatus(ev, e.id, s.id)}>
                      <span className={`dot ${st}`} />{st === "ok" ? "已繳" : st === "miss" ? "缺件" : "—"}
                    </span></td>
                  ); })}
                </tr>
              ))}
              {list.length === 0 && (
                <tr><td colSpan={flat.length + 2} style={{ textAlign: "center", padding: 20, color: "#888", fontSize: 12 }}>查無符合條件的員工</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Right Panel ── */}
      <RightPanel
        emp={selEmp}
        curRT={curRT}
        setCurRT={setCurRT}
        activeG={activeG}
        form={selEmp ? getForm(selEmp.id) : mkForm()}
        setForm={f => selEmp && updateForm(selEmp.id, f)}
        show={show}
      />

      {Toast}
    </div>
  );
}
