import { useState, useEffect, useCallback } from "react";
import { getRecords, clearRecords, deleteRecord, exportJSON, exportCSV } from "../verifyStore";

const KIND_STYLE = {
  "異常": { bg: "var(--miss-bg, #FBEAEA)", tx: "var(--miss-tx, #A32D2D)", icon: "❌" },
  "遺漏": { bg: "#FFF4E0", tx: "#8A5A00", icon: "⚠" },
  "重複": { bg: "#EAF1FB", tx: "#1F5Fa8", icon: "🔁" },
};

export default function VerifyRecordsPage() {
  const [records, setRecords] = useState([]);
  const [kindFilter, setKindFilter] = useState("");   // "" | 異常 | 遺漏 | 重複
  const [periodFilter, setPeriodFilter] = useState("");
  const [q, setQ] = useState("");

  const reload = useCallback(() => setRecords(getRecords()), []);
  useEffect(() => { reload(); }, [reload]);

  const periods = [...new Set(records.map(r => r.period).filter(Boolean))].sort().reverse();

  const filtered = records.filter(r =>
    (!kindFilter || r.kind === kindFilter) &&
    (!periodFilter || r.period === periodFilter) &&
    (!q || (r.emp + r.empEn + r.category).toLowerCase().includes(q.toLowerCase()))
  );

  const counts = {
    異常: records.filter(r => r.kind === "異常").length,
    遺漏: records.filter(r => r.kind === "遺漏").length,
    重複: records.filter(r => r.kind === "重複").length,
  };

  const onClear = () => {
    if (window.confirm("確定清空所有核對記錄？此動作無法復原。")) {
      clearRecords(); reload();
    }
  };
  const onDelete = (id) => { deleteRecord(id); reload(); };

  return (
    <div className="kanban-page" style={{ padding: "16px 20px", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--b800)", margin: 0 }}>🔍 核對記錄</h2>
        <span style={{ fontSize: 12, color: "#888" }}>
          共 {records.length} 筆（異常 {counts.異常}／遺漏 {counts.遺漏}／重複 {counts.重複}）
        </span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button className="btn sm" onClick={() => { exportCSV(); }} disabled={!records.length}>⬇ 導出 CSV</button>
          <button className="btn sm" onClick={() => { exportJSON(); }} disabled={!records.length}>⬇ 導出 JSON</button>
          <button className="btn sm" onClick={onClear} disabled={!records.length}
                  style={{ color: "var(--miss-tx)" }}>🗑 清空</button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 4 }}>
          {["", "異常", "遺漏", "重複"].map(k => (
            <button key={k || "all"}
                    className={`chip ${kindFilter === k ? "on" : ""}`}
                    style={{ padding: "4px 12px" }}
                    onClick={() => setKindFilter(k)}>
              {k || "全部"}
            </button>
          ))}
        </div>
        <select className="di" value={periodFilter} onChange={e => setPeriodFilter(e.target.value)}
                style={{ fontSize: 12, padding: "4px 8px" }}>
          <option value="">全部月份</option>
          {periods.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <input className="di" placeholder="搜尋員工 / 項目…" value={q}
               onChange={e => setQ(e.target.value)}
               style={{ flex: 1, minWidth: 160, fontSize: 12, padding: "4px 8px" }} />
      </div>

      {filtered.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "#aaa", fontSize: 13,
                      border: "1px dashed var(--bd)", borderRadius: 10 }}>
          {records.length === 0
            ? "尚無核對記錄。到缺件看板執行「核對」後，異常/遺漏/重複會自動存到這裡。"
            : "目前篩選條件下沒有記錄。"}
        </div>
      ) : (
        <div style={{ border: "1px solid var(--bd)", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "var(--b50)", textAlign: "left" }}>
                <th style={th}>類型</th>
                <th style={th}>員工</th>
                <th style={th}>月份</th>
                <th style={th}>範圍</th>
                <th style={th}>項目</th>
                <th style={th}>欄位</th>
                <th style={th}>我 key in</th>
                <th style={th}>範本記錄</th>
                <th style={th}>備註</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const ks = KIND_STYLE[r.kind] || {};
                return (
                  <tr key={r.id} style={{ borderTop: "1px solid var(--bd)" }}>
                    <td style={td}>
                      <span style={{ display: "inline-block", padding: "1px 8px", borderRadius: 10,
                                     fontSize: 11, background: ks.bg, color: ks.tx, whiteSpace: "nowrap" }}>
                        {ks.icon} {r.kind}
                      </span>
                    </td>
                    <td style={{ ...td, fontWeight: 500 }}>{r.emp}</td>
                    <td style={td}>{r.period}</td>
                    <td style={{ ...td, color: "#888", whiteSpace: "nowrap" }}>{r.range || "—"}</td>
                    <td style={td}>{r.category}</td>
                    <td style={{ ...td, color: "#888" }}>{r.field}</td>
                    <td style={{ ...td, color: ks.tx }}>{r.keyed}</td>
                    <td style={td}>{r.template}</td>
                    <td style={{ ...td, color: "#888", maxWidth: 240 }}>{r.note}</td>
                    <td style={td}>
                      <button className="btn sm" onClick={() => onDelete(r.id)}
                              style={{ padding: "1px 6px", fontSize: 11 }}>✕</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: 10, fontSize: 11, color: "#aaa" }}>
        💡 記錄存在瀏覽器本機（localStorage），同一台電腦／瀏覽器才看得到。需跨裝置保留請使用「導出」。
        重新核對同一員工同月份時，舊記錄會自動覆蓋。
      </div>
    </div>
  );
}

const th = { padding: "8px 10px", fontWeight: 500, color: "var(--b800)", whiteSpace: "nowrap" };
const td = { padding: "7px 10px", verticalAlign: "top" };
