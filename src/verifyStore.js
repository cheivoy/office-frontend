// src/verifyStore.js — 核對記錄暫存區（本機 localStorage，可導出）
// 每次核對完，把「異常 / 遺漏 / 重複」攤平成一筆筆記錄存起來，
// 關掉 modal、重整頁面後都還在，並可導出 JSON / CSV。

const LS_KEY = "verify_records_v1";

const CAT_LABEL = { travel: "差旅TA", ot: "OT", ns: "NS", ess: "ESS" };

function readAll() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); } catch { return []; }
}
function writeAll(records) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(records)); } catch {}
}

export function getRecords() { return readAll(); }

export function clearRecords() { writeAll([]); }

export function deleteRecord(id) {
  writeAll(readAll().filter(r => r.id !== id));
}

// Flatten one employee's verify result (from verifyEmployee) into rows and append.
// meta: { period, empEn, empCn }
export function addVerifyResult(meta, result) {
  if (!result) return;
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");
  const batchId = `${Date.now()}_${meta.empEn}`;
  const rows = [];

  for (const cat of ["travel", "ot", "ns", "ess"]) {
    const c = result[cat];
    if (!c) continue;

    // 1) anomalies — 我們 key in 的 vs 範本記錄
    (c.anomalies || []).forEach((a, i) => {
      rows.push({
        id: `${batchId}_${cat}_a${i}`,
        ts: now, period: meta.period, emp: meta.empCn || meta.empEn, empEn: meta.empEn,
        category: CAT_LABEL[cat] || cat, kind: "異常",
        field: a.field || "", keyed: a.found || "", template: a.expected || "",
        note: a.note || "",
      });
    });

    // 2) 遺漏：範本有 approved 但你沒 key in
    (c.missing || []).forEach((d, i) => {
      rows.push({
        id: `${batchId}_${cat}_m${i}`,
        ts: now, period: meta.period, emp: meta.empCn || meta.empEn, empEn: meta.empEn,
        category: CAT_LABEL[cat] || cat, kind: "遺漏",
        field: "date", keyed: "未申請", template: d,
        note: "Approval 中有此日期，但本月未 key in",
      });
    });

    // 3) 重複：本月日期在過去月份已申請過
    (c.duplicates || []).forEach((dup, i) => {
      rows.push({
        id: `${batchId}_${cat}_d${i}`,
        ts: now, period: meta.period, emp: meta.empCn || meta.empEn, empEn: meta.empEn,
        category: CAT_LABEL[cat] || cat, kind: "重複",
        field: "date", keyed: dup.date, template: `${dup.period} 已申請`,
        note: `此日期在 ${dup.period} 已申請過，請確認是否重複`,
      });
    });
  }

  if (!rows.length) return 0;
  const all = readAll();
  // 移除同員工同月份的舊記錄，避免重複核對堆疊
  const filtered = all.filter(r => !(r.empEn === meta.empEn && r.period === meta.period));
  writeAll([...rows, ...filtered]);
  return rows.length;
}

export function exportJSON() {
  const blob = new Blob([JSON.stringify(readAll(), null, 2)], { type: "application/json" });
  download(blob, `核對記錄_${stamp()}.json`);
}

export function exportCSV() {
  const records = readAll();
  const cols = ["ts", "period", "emp", "category", "kind", "field", "keyed", "template", "note"];
  const head = ["核對時間", "月份", "員工", "項目", "類型", "欄位", "我key in", "範本記錄", "備註"];
  const esc = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [head.map(esc).join(",")];
  for (const r of records) lines.push(cols.map(c => esc(r[c])).join(","));
  // BOM so Excel opens 中文 correctly
  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  download(blob, `核對記錄_${stamp()}.csv`);
}

function stamp() {
  return new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
}
function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
