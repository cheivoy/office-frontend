import { useState } from "react";
import { submitData, submitWipro, writeProjectF, writeNokiaCost, downloadBlob } from "../api";
import { useApi } from "../hooks";

const WRITE_TARGETS = [
  { id: "cht_nokia",    label: "2026-Nokia 工作天數紀錄表", icon: "📊", desc: "CHT 員工 / 按 PM 分檔" },
  { id: "project_f",   label: "Project F CNS&MN",          icon: "📋", desc: "所有單位 / 共用報表" },
  { id: "wipro_snda",  label: "SNDA_PO_Invoice_Dashboard", icon: "📈", desc: "Wipro 員工 / 新建 sheet" },
  { id: "nokia_cost",  label: "Nokia 費用統整_2026",         icon: "💰", desc: "所有單位 / 輸出無格式 xlsx" },
];

export default function WriteModal({ emp, form, onClose, show }) {
  const [target, setTarget]   = useState("cht_nokia");
  const [file, setFile]       = useState(null);
  const [sheet, setSheet]     = useState("");
  const { loading, run }      = useApi();

  const doWrite = () => {
    if (!file) { show("請先選擇當月範本檔案", "err"); return; }

    const essTotal  = form.ess.reduce((a, r) => a + (parseFloat(r.amount) || 0), 0);
    const nsTotal   = form.ess.reduce((a, r) => a + (parseFloat(r.ns_amount) || 0), 0);
    const taTotal   = form.ta.reduce((a,  r) => a + (parseFloat(r.amount)  || 0), 0);

    const fmtDates = (rows) => rows.filter(r => r.from_date).map(r =>
      r.from_date === r.to_date ? r.from_date.slice(5).replace("-", "") :
      `${r.from_date.slice(5).replace("-","")}~${r.to_date.slice(5).replace("-","")}`
    ).join("  ");

    const fmtEssDates = (rows) => rows.filter(r => r.date).map(r =>
      r.date.slice(5).replace("-", "")
    ).join("  ");

    const fmtNsDates = (rows) => rows.filter(r => r.date && parseFloat(r.ns_amount) > 0).map(r =>
      r.date.slice(5).replace("-", "")
    ).join("  ");

    run(async () => {
      let blob;
      if (target === "cht_nokia" || target === "cht_dk") {
        const payload = {
          emp_name: emp.cn || emp.en, emp_en: emp.en,
          work_days: parseFloat(form.workdays) || null,
          ess: form.ess, ot: form.ot, ta: form.ta, leave: form.leave,
          write_target: emp.pm === "DK" ? "cht_dk" : "cht_nokia",
        };
        blob = await submitData(payload, file);
      } else if (target === "wipro_snda") {
        const payload = {
          emp_en: emp.en,
          ess_amount:   essTotal,
          shift_amount: nsTotal,
          ot:           form.ot,
          travel_amount: taTotal,
        };
        blob = await submitWipro(payload, file, sheet);
      } else if (target === "project_f") {
        const tabJson = {
          work_days: parseFloat(form.workdays) || null,
          ess_total: essTotal, ta_total: taTotal,
        };
        blob = await writeProjectF(emp.en, tabJson, file);
      } else if (target === "nokia_cost") {
        const tabJson = {
          ta_dates:   fmtDates(form.ta),     ta_amount:  taTotal,
          ns_dates:   fmtNsDates(form.ess),  ns_amount:  nsTotal,
          ess_dates:  fmtEssDates(form.ess), ess_amount: essTotal,
        };
        blob = await writeNokiaCost(emp.en, tabJson, file, sheet);
      }
      downloadBlob(blob, `output_${file.name}`);
      return "ok";
    },
    () => { show("寫入成功，已下載 ✓", "ok"); onClose(); },
    (e) => show(`寫入失敗：${e}`, "err")
    );
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-hd">
          <span className="modal-hd-t">📝 寫入 Excel — {emp.cn || emp.en}</span>
          <button className="btn sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: 12, color: "#888", marginBottom: 10 }}>選擇寫入目標：</p>
          {WRITE_TARGETS.map(t => (
            <label key={t.id} className="radio-row">
              <input type="radio" name="wt" value={t.id} checked={target===t.id}
                     onChange={() => setTarget(t.id)} />
              <span style={{ fontSize: 16 }}>{t.icon}</span>
              <span>
                <div style={{ fontWeight: 500 }}>{t.label}</div>
                <div style={{ fontSize: 11, color: "#888" }}>{t.desc}</div>
              </span>
            </label>
          ))}

          {target === "wipro_snda" && (
            <div className="fl" style={{ marginTop: 8 }}>
              <div className="fg">
                <label style={{ fontSize: 11, color: "#8AB2D8", display:"block", marginBottom:2 }}>
                  Sheet 名稱（如 P06_26）
                </label>
                <input className="di" style={{ width:"100%" }} value={sheet}
                       onChange={e => setSheet(e.target.value)} placeholder="P06_26" />
              </div>
            </div>
          )}

          {target === "nokia_cost" && (
            <div className="fl" style={{ marginTop: 8 }}>
              <div className="fg">
                <label style={{ fontSize: 11, color: "#8AB2D8", display:"block", marginBottom:2 }}>
                  Sheet 名稱（如 5月費用申請）
                </label>
                <input className="di" style={{ width:"100%" }} value={sheet}
                       onChange={e => setSheet(e.target.value)} placeholder="5月費用申請" />
              </div>
            </div>
          )}

          <div className="upload-zone" onClick={() => document.getElementById("wm-file").click()}>
            {file
              ? <><div style={{fontSize:20}}>✅</div><div style={{fontWeight:500,color:""}}>{file.name}</div></>
              : <><div style={{fontSize:24}}>📂</div><div>點擊選擇當月 Excel 範本</div><div style={{fontSize:11,color:"#aaa"}}>請使用最新範本，格式需與原始範本一致</div></>
            }
          </div>
          <input id="wm-file" type="file" accept=".xlsx" style={{ display:"none" }}
                 onChange={e => setFile(e.target.files[0])} />
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>取消</button>
          <button className="btn blue" onClick={doWrite} disabled={loading || !file}>
            {loading ? <span className="spinner" /> : "📥"} 確認寫入
          </button>
        </div>
      </div>
    </div>
  );
}
