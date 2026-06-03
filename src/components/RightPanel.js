import React, { useState, useEffect } from "react";
import { getEmployeeFiles, previewFileUrl, previewEml, downloadZip, downloadAllZip,
         submitData, downloadBlob, attachmentUrl } from "../api";
import { useApi, useToast } from "../hooks";

const LEAVE_TYPES = ["sick leave","personal leave","annual leave","official leave","other"];

function calcHours(tstart, tend) {
  if (!tstart || !tend) return "";
  const [sh, sm] = tstart.split(":").map(Number);
  const [eh, em] = tend.split(":").map(Number);
  let d = (eh * 60 + em) - (sh * 60 + sm);
  if (d < 0) d += 1440;
  return (d / 60).toFixed(1);
}

function buildLeaveStr(rows) {
  return rows.filter(r => r.dates).map(r => {
    const ds = r.dates.trim().split(/\s+/).join(", ");
    const hrs = r.hours ? `_${r.hours} ` : "_";
    const label = r.type === "other" && r.reason ? r.reason : (r.type || "leave");
    return `${ds}${hrs}${label}`;
  }).join("  ");
}

function buildOtStr(rows) {
  return rows.filter(r => r.date && r.tstart && r.tend).map(r => {
    const mm = r.date.slice(5).replace("-", "");
    const ts = r.tstart.replace(":", "");
    const te = r.tend.replace(":", "");
    const h = r.hours ? `_${r.hours}hrs` : "";
    return `${mm}_${ts}-${te}${h}`;
  }).join("  ");
}

export default function RightPanel({ emp, curRT, setCurRT, activeG, form, setForm, show }) {
  const [files, setFiles]           = useState([]);
  const [modal, setModal]           = useState(null);
  const [uploadedFile, setUploadedFile] = useState(null);
  const { loading, run }            = useApi();

  useEffect(() => {
    if (!emp) return;
    run(
      () => getEmployeeFiles(emp.en),
      r => setFiles(r.files || []),
      () => setFiles([])
    );
  }, [emp]); // eslint-disable-line

  if (!emp) return (
    <div className="right-panel">
      <div className="rtabs">
        <div className="rtab on">檔案</div>
        <div className="rtab">填寫</div>
      </div>
      <div className="rpanel"><div className="empty-state">👤<br />點選員工<br />查看資料</div></div>
    </div>
  );

  const warns = [];
  if (activeG.has("ess")    && !form.ess.length)                             warns.push("ESS 尚未填寫");
  if (activeG.has("ot")     && !form.ot.length)                              warns.push("OT 尚未填寫");
  if (activeG.has("ns")     && !form.ess.some(r => parseFloat(r.ns_amount))) warns.push("NS 金額尚未填寫");
  if (activeG.has("travel") && !form.ta.length)                              warns.push("差旅 TA 尚未填寫");
  if (activeG.has("leave")  && !form.leave.length)                           warns.push("請假尚未填寫");

  // ── file open/download ──
  const openFile = async (f) => {
    if (f.type === "eml") {
      try { const data = await previewEml(emp.en, f.name); setModal({ type: "eml", name: f.name, data }); }
      catch { show("無法預覽此 eml", "err"); }
    } else if (f.type === "pdf") {
      setModal({ type: "pdf", name: f.name, url: previewFileUrl(emp.en, f.name) });
    } else {
      setModal({ type: "xlsx", name: f.name, url: previewFileUrl(emp.en, f.name) });
    }
  };

  const dlZip = () => run(() => downloadZip(emp.en), b => downloadBlob(b, `${emp.en}_files.zip`), e => show(e, "err"));
  const dlAll = () => run(() => downloadAllZip(),    b => downloadBlob(b, "all_departments.zip"),  e => show(e, "err"));

  // ── form helpers ──
  const updRow = (key, idx, field, val) => {
    const rows = [...(form[key] || [])];
    rows[idx] = { ...rows[idx], [field]: val };
    if ((field === "tstart" || field === "tend") && (key === "ess" || key === "ot")) {
      rows[idx].hours = calcHours(rows[idx].tstart, rows[idx].tend);
    }
    setForm({ ...form, [key]: rows });
  };
  const addRow  = (key, def = {}) => setForm({ ...form, [key]: [...(form[key] || []), def] });
  const rmRow   = (key, idx)      => setForm({ ...form, [key]: form[key].filter((_, i) => i !== idx) });

  // ── write to excel ──
  const writeSection = async (key) => {
    if (!uploadedFile) { show("請先選擇當月 Excel 範本", "err"); return; }
    const payload = {
      emp_name: emp.cn || emp.en,
      emp_en:   emp.en,
      work_days: parseFloat(form.workdays) || null,
      ess:   form.ess,
      ot:    form.ot,
      ta:    form.ta,
      leave: form.leave,
      write_target: emp.unit === "wipro" ? "wipro_snda" : (emp.pm === "DK" ? "cht_dk" : "cht_nokia"),
    };
    run(
      () => submitData(payload, uploadedFile),
      blob => { downloadBlob(blob, `output_${uploadedFile.name}`); show(`${key.toUpperCase()} 寫入成功，已下載`); },
      e => show(`寫入失敗：${e}`, "err")
    );
  };

  // ── section totals ──
  const essTotal = form.ess.reduce((a, r) => a + (parseFloat(r.amount) || 0), 0);
  const nsTotal  = form.ess.reduce((a, r) => a + (parseFloat(r.ns_amount) || 0), 0);
  const taTotal  = form.ta.reduce((a, r) => a + (parseFloat(r.amount) || 0), 0);

  return (
    <div className="right-panel">
      <div className="rtabs">
        <div className={`rtab ${curRT === "files" ? "on" : ""}`} onClick={() => setCurRT("files")}>📁 檔案</div>
        <div className={`rtab ${curRT === "form"  ? "on" : ""}`} onClick={() => setCurRT("form")}>✏️ 填寫</div>
      </div>

      <div className="rpanel">
        <div className="rhd">
          {emp.cn || emp.en}
          {emp.cn && emp.en && <span style={{ fontSize: 11, fontWeight: 400, color: "#888", marginLeft: 6 }}>{emp.en}</span>}
        </div>

        {curRT === "files" && (
          <>
            {loading && <div style={{ fontSize: 12, color: "#888" }}>載入中…</div>}
            {!loading && files.length === 0 && <div style={{ fontSize: 12, color: "#888" }}>暫無歸檔檔案</div>}
            {files.map(f => (
              <div key={f.name} className="file-row" onClick={() => openFile(f)}>
                <span className={`ftype ${f.type}`}>{f.type.toUpperCase()}</span>
                <span className="fname">{f.name}</span>
                <span>👁</span>
              </div>
            ))}
            <div style={{ display: "flex", gap: 5, marginTop: 8 }}>
              <button className="btn sm" style={{ flex: 1, justifyContent: "center" }} onClick={dlZip}>⬇ zip</button>
              <button className="btn sm" style={{ flex: 1, justifyContent: "center" }} onClick={dlAll}>📦 全部</button>
            </div>
          </>
        )}

        {curRT === "form" && (
          <>
            {warns.length > 0 && (
              <div className="warn-box">
                ⚠️ <strong>已勾選欄位但未填寫：</strong><br />
                {warns.map(w => <div key={w}>· {w}</div>)}
              </div>
            )}

            {/* Work Days */}
            <div className="wd-row">
              <label>📅 Work Days</label>
              <input type="number" min="0" max="31" step="0.5" value={form.workdays}
                     onChange={e => setForm({ ...form, workdays: e.target.value })} />
              <span style={{ fontSize: 11, color: "#8AB2D8" }}>天</span>
            </div>

            {/* ESS / NS */}
            <SecBlock title="ESS / NS" warn={activeG.has("ess") && !form.ess.length}
                      onAdd={() => addRow("ess")} onWrite={() => writeSection("ess")} loading={loading}
                      onUpload={setUploadedFile} uploadedFile={uploadedFile}>
              {form.ess.map((r, i) => (
                <div key={i} className="entry">
                  <button className="rm-btn" onClick={() => rmRow("ess", i)}>×</button>
                  <div className="fl">
                    <div className="fg"><label>日期</label><input type="date" value={r.date || ""} onChange={e => updRow("ess", i, "date", e.target.value)} /></div>
                    <div className="fg"><label>開始</label><input type="time" value={r.tstart || ""} onChange={e => updRow("ess", i, "tstart", e.target.value)} /></div>
                    <div className="fg"><label>結束</label><input type="time" value={r.tend || ""} onChange={e => updRow("ess", i, "tend", e.target.value)} /></div>
                  </div>
                  <div className="fl">
                    <div className="fg"><label>時數</label><input readOnly value={r.hours || ""} placeholder="自動" /></div>
                    <div className="fg"><label>ESS金額</label><input type="number" value={r.amount || ""} onChange={e => updRow("ess", i, "amount", e.target.value)} /></div>
                    <div className="fg"><label>NS金額</label><input type="number" value={r.ns_amount || ""} onChange={e => updRow("ess", i, "ns_amount", e.target.value)} /></div>
                  </div>
                </div>
              ))}
              {form.ess.length > 0 && <div className="subtotal">ESS: NT${Math.round(essTotal).toLocaleString()}　NS: NT${Math.round(nsTotal).toLocaleString()}</div>}
            </SecBlock>

            {/* OT */}
            <SecBlock title="OT 加班" warn={activeG.has("ot") && !form.ot.length}
                      onAdd={() => addRow("ot")} onWrite={() => writeSection("ot")} loading={loading}
                      onUpload={setUploadedFile} uploadedFile={uploadedFile}>
              {form.ot.map((r, i) => (
                <div key={i} className="entry">
                  <button className="rm-btn" onClick={() => rmRow("ot", i)}>×</button>
                  <div className="fl">
                    <div className="fg"><label>日期</label><input type="date" value={r.date || ""} onChange={e => updRow("ot", i, "date", e.target.value)} /></div>
                    <div className="fg"><label>開始</label><input type="time" value={r.tstart || ""} onChange={e => updRow("ot", i, "tstart", e.target.value)} /></div>
                    <div className="fg"><label>結束</label><input type="time" value={r.tend || ""} onChange={e => updRow("ot", i, "tend", e.target.value)} /></div>
                  </div>
                  <div className="fl">
                    <div className="fg"><label>時數</label><input readOnly value={r.hours || ""} placeholder="自動" /></div>
                    <div className="fg"><label>金額(選填)</label><input type="number" value={r.amount || ""} onChange={e => updRow("ot", i, "amount", e.target.value)} /></div>
                  </div>
                </div>
              ))}
              {form.ot.length > 0 && <div className="outfmt">{buildOtStr(form.ot)}</div>}
            </SecBlock>

            {/* 差旅 TA */}
            <SecBlock title="差旅 TA" warn={activeG.has("travel") && !form.ta.length}
                      onAdd={() => addRow("ta")} onWrite={() => writeSection("ta")} loading={loading}
                      onUpload={setUploadedFile} uploadedFile={uploadedFile}>
              {form.ta.map((r, i) => (
                <div key={i} className="entry">
                  <button className="rm-btn" onClick={() => rmRow("ta", i)}>×</button>
                  <div className="fl">
                    <div className="fg"><label>開始日期</label><input type="date" value={r.from_date || ""} onChange={e => updRow("ta", i, "from_date", e.target.value)} /></div>
                    <div className="fg"><label>結束日期</label><input type="date" value={r.to_date || ""} onChange={e => updRow("ta", i, "to_date", e.target.value)} /></div>
                  </div>
                  <div className="fl">
                    <div className="fg"><label>金額</label><input type="number" value={r.amount || ""} onChange={e => updRow("ta", i, "amount", e.target.value)} /></div>
                  </div>
                </div>
              ))}
              {form.ta.length > 0 && <div className="subtotal">差旅小計: NT${Math.round(taTotal).toLocaleString()}</div>}
            </SecBlock>

            {/* 請假 */}
            <SecBlock title="請假" warn={activeG.has("leave") && !form.leave.length}
                      onAdd={() => addRow("leave", { type: "sick leave" })} onWrite={() => writeSection("leave")} loading={loading}
                      onUpload={setUploadedFile} uploadedFile={uploadedFile}>
              {form.leave.map((r, i) => (
                <div key={i} className="entry">
                  <button className="rm-btn" onClick={() => rmRow("leave", i)}>×</button>
                  <div className="fl">
                    <div className="fg" style={{ flex: 2 }}><label>日期（空格分隔多日）</label>
                      <input type="text" value={r.dates || ""} placeholder="0504 0514 0526"
                             onChange={e => updRow("leave", i, "dates", e.target.value)} /></div>
                  </div>
                  <div className="fl">
                    <div className="fg"><label>假別</label>
                      <select value={r.type || "sick leave"} onChange={e => updRow("leave", i, "type", e.target.value)}>
                        {LEAVE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div className="fg"><label>時數(選填)</label>
                      <input type="text" value={r.hours || ""} placeholder="3hrs"
                             onChange={e => updRow("leave", i, "hours", e.target.value)} /></div>
                  </div>
                  {r.type === "other" && (
                    <div className="fl"><div className="fg" style={{ flex: 1 }}><label>原因</label>
                      <input type="text" value={r.reason || ""} placeholder="請說明原因"
                             onChange={e => updRow("leave", i, "reason", e.target.value)} /></div></div>
                  )}
                </div>
              ))}
              {form.leave.length > 0 && <div className="outfmt" style={{ whiteSpace: "normal", wordBreak: "break-all" }}>{buildLeaveStr(form.leave)}</div>}
            </SecBlock>
          </>
        )}
      </div>

      {/* ── Modal ── */}
      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className={`modal ${modal.type === "eml" ? "" : "wide"}`} onClick={e => e.stopPropagation()}>
            <div className="modal-hd">
              <span className="modal-hd-title">{modal.name}</span>
              <button className="btn sm" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              {modal.type === "pdf" && <iframe src={modal.url} title={modal.name} />}
              {modal.type === "xlsx" && <div style={{ fontSize: 12, color: "#888" }}>xlsx 預覽需後端解析（正式版 SheetJS）</div>}
              {modal.type === "eml" && modal.data && (
                <>
                  {[["From", modal.data.from], ["To", modal.data.to], ["Subject", modal.data.subject], ["Date", modal.data.date]].map(([lbl, val]) => (
                    <div key={lbl} style={{ marginBottom: 4, fontSize: 12 }}><strong>{lbl}:</strong> {val}</div>
                  ))}
                  <div style={{ marginTop: 10, whiteSpace: "pre-wrap", borderTop: "1px solid #DDE8F6", paddingTop: 10, fontSize: 12 }}>{modal.data.body}</div>
                  {modal.data.attachments?.length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontSize: 11, fontWeight: 500, color: "#0D4A8A", marginBottom: 4 }}>附件：</div>
                      {modal.data.attachments.map(a => (
                        <a key={a.filename} href={attachmentUrl(emp.en, modal.name, a.filename)}
                           download={a.filename} style={{ display: "block", fontSize: 11, color: "#1F6BB5", marginBottom: 2 }}>
                          📎 {a.filename} ({(a.size / 1024).toFixed(1)} KB)
                        </a>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SecBlock({ title, warn, onAdd, onWrite, loading, onUpload, uploadedFile, children }) {
  return (
    <div className="sec-block">
      <div className="sec-hd">
        <span className="sec-title">{title}</span>
        {warn ? <span className="warn-badge">⚠ 待填</span> : children && React.Children.count(children) > 0 && <span className="ok-badge">✓ 已填</span>}
        <button className="sec-add" onClick={onAdd}>＋ 新增</button>
      </div>
      {children}
      <label className="upload-row">
        <span>📄</span>
        {uploadedFile ? <span className="fn">✓ {uploadedFile.name}</span> : <span>選擇當月 Excel 範本 →</span>}
        <input type="file" accept=".xlsx" style={{ display: "none" }} onChange={e => onUpload(e.target.files[0])} />
      </label>
      <button className="btn blue sm" style={{ width: "100%", justifyContent: "center" }}
              onClick={onWrite} disabled={loading}>
        {loading ? <span className="spinner" /> : `寫入 ${title}`}
      </button>
    </div>
  );
}

