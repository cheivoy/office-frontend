// src/verify.js — client-side cross-check (ported from backend verify_svc.py)
// Reads the uploaded approval xlsx with SheetJS and compares against TAB data.
// No backend round-trip, no file upload — runs entirely in the browser.
import * as XLSX from "xlsx";

// ── name / date / time helpers (ported from name_utils.py) ───────────────────

function normalize(s) {
  if (!s) return "";
  s = String(s).normalize("NFKC");
  s = s.replace(/[（()（）)）\-_.,，。]/g, " ");
  return s.toLowerCase().trim();
}

function tokens(s) {
  return normalize(s).split(/\s+/).filter(t => t.length >= 2);
}

export function nameMatch(cellName, empEn, empCn = "") {
  if (!cellName) return false;
  const cell = normalize(cellName);
  if (empEn && normalize(empEn) === cell) return true;
  if (empEn) {
    const toks = tokens(empEn);
    if (toks.length && toks.every(t => cell.includes(t))) return true;
    if (toks.length >= 2 && cell.includes(toks[0]) && cell.includes(toks[1])) return true;
  }
  if (empCn && empCn.trim() && String(cellName).includes(empCn.trim())) return true;
  return false;
}

const pad2 = n => String(n).padStart(2, "0");

// Convert Excel serial / Date / string → "YYYY-MM-DD"
export function parseDate(val) {
  if (val === null || val === undefined || val === "") return null;
  if (val instanceof Date) {
    return `${val.getFullYear()}-${pad2(val.getMonth() + 1)}-${pad2(val.getDate())}`;
  }
  if (typeof val === "number") {
    // Excel serial date. Base 1899-12-30; decode in local time to match how
    // spreadsheet apps store day values (avoids timezone off-by-one).
    const days = Math.round(val);
    const d = new Date(1899, 11, 30 + days);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
  const s = String(val).trim();
  // YYYY-MM-DD or YYYY/MM/DD
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;
  // MM/DD/YYYY
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${pad2(m[1])}-${pad2(m[2])}`;
  return s; // best effort (e.g. partial)
}

// Parse "18:00 - 19:00" / "18:00~19:00" → ["18:00","19:00"]
export function parseTimeRange(s) {
  if (!s) return null;
  const m = String(s).match(/(\d{1,2}:\d{2})\s*[-~–]\s*(\d{1,2}:\d{2})/);
  if (m) return [m[1].padStart(5, "0"), m[2].padStart(5, "0")];
  return null;
}

function expandDates(entry) {
  const fd = parseDate(entry.from_date || entry.date || "");
  let td = parseDate(entry.to_date || (entry.from_date || entry.date) || "");
  if (!fd) return [];
  if (!td || td < fd) td = fd;
  const out = [];
  try {
    const [y1, m1, d1] = fd.split("-").map(Number);
    const [y2, m2, d2] = td.split("-").map(Number);
    let cur = new Date(Date.UTC(y1, m1 - 1, d1));
    const end = new Date(Date.UTC(y2, m2 - 1, d2));
    while (cur <= end && out.length < 60) {
      out.push(`${cur.getUTCFullYear()}-${pad2(cur.getUTCMonth() + 1)}-${pad2(cur.getUTCDate())}`);
      cur = new Date(cur.getTime() + 86400000);
    }
  } catch {
    return [fd];
  }
  return out;
}

// ── sheet helpers ─────────────────────────────────────────────────────────────

// Read a worksheet into an array-of-rows (each row an array, 0-based cols).
function sheetRows(ws) {
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
}

function* iterApproved(rows, nameCol, statusCol, empEn, empCn, startIdx = 1) {
  for (let i = startIdx; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const cellName = row.length > nameCol ? row[nameCol] : null;
    const status = (row.length > statusCol ? String(row[statusCol] || "") : "").trim().toLowerCase();
    if (!nameMatch(cellName, empEn, empCn)) continue;
    if (!status.includes("approv")) continue;
    yield row;
  }
}

function dedup(rows, keyFn) {
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const k = keyFn(r);
    if (!seen.has(k)) { seen.add(k); out.push(r); }
  }
  return out;
}

const fmtNT = n => `NT$${Math.round(n).toLocaleString()}`;
const num = v => parseFloat(v || 0) || 0;

// ── workbook loader ────────────────────────────────────────────────────────────

export async function readWorkbook(file) {
  const buf = await file.arrayBuffer();
  return XLSX.read(buf, { type: "array", cellDates: true });
}

// ── Travel ──────────────────────────────────────────────────────────────────
export function verifyTravel(wb, empEn, empCn, tabTa) {
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = sheetRows(ws);
  const NAME = 1, STATUS = 17, START = 10, END = 11, TOTAL = 28;
  const res = { emp: empEn, status: "not_found", matched_rows: 0, anomalies: [],
                template_dates: [], keyed_dates: [], details: [] };

  const matched = dedup(
    [...iterApproved(rows, NAME, STATUS, empEn, empCn)],
    r => `${parseDate(r[START])}|${parseDate(r[END])}`
  );
  // Collect every approved date the template covers (for gap detection)
  const tplDateSet = new Set();
  for (const r of matched) {
    for (const d of expandDates({ from_date: parseDate(r[START]), to_date: parseDate(r[END]) })) tplDateSet.add(d);
  }
  res.template_dates = [...tplDateSet].sort();

  if (!matched.length) return res;
  res.matched_rows = matched.length;
  res.status = "ok";

  for (const t of tabTa) {
    const from = t.from_date || "", to = t.to_date || "", amt = num(t.amount);
    for (const d of expandDates(t)) res.keyed_dates.push(d);
    const hit = matched.find(r => parseDate(r[START]) === from && parseDate(r[END]) === to);
    res.details.push({
      keyed: { from, to, amount: amt },
      approval: hit ? { from: parseDate(hit[START]), to: parseDate(hit[END]), amount: num(hit[TOTAL]) } : null,
    });
    if (!hit) {
      res.status = "anomaly";
      res.anomalies.push({ field: "travel_date", expected: `${from} ~ ${to}`,
        found: "查無對應紀錄", note: "Approval 中找不到相符的差旅日期區間" });
      continue;
    }
    const approved = num(hit[TOTAL]);
    if (amt > approved) {
      res.status = "anomaly";
      res.anomalies.push({ field: "travel_amount", expected: `≤ ${fmtNT(approved)}`,
        found: fmtNT(amt), note: `申請金額超過 Approval Total Expenses（差額 ${fmtNT(amt - approved)}）` });
    }
  }
  return res;
}

// ── OT ────────────────────────────────────────────────────────────────────────
export function verifyOt(wb, empEn, empCn, tabOt) {
  const ws = wb.Sheets["OT Data"];
  const res = { emp: empEn, status: "not_found", matched_rows: 0, anomalies: [],
                template_dates: [], keyed_dates: [], details: [] };
  if (!ws) return res;
  const rows = sheetRows(ws);
  const NAME = 1, STATUS = 5, DATE = 17, TIME = 18, HRS = 20;

  const matched = dedup(
    [...iterApproved(rows, NAME, STATUS, empEn, empCn)],
    r => `${parseDate(r[DATE])}|${String(r[TIME] || "").trim()}`
  );
  res.template_dates = [...new Set(matched.map(r => parseDate(r[DATE])).filter(Boolean))].sort();
  if (!matched.length) return res;
  res.matched_rows = matched.length;
  res.status = "ok";

  for (const t of tabOt) {
    const date = t.date || "", start = t.tstart || "", end = t.tend || "", hrs = num(t.hours);
    if (date) res.keyed_dates.push(date);
    let hit = null;
    for (const r of matched) {
      if (parseDate(r[DATE]) !== date) continue;
      const rt = parseTimeRange(String(r[TIME] || ""));
      if (rt && rt[0] === start && rt[1] === end) { hit = r; break; }
      if (rt === null) { hit = r; break; }
    }
    res.details.push({
      keyed: { date, start, end, hours: hrs },
      approval: hit ? { date: parseDate(hit[DATE]), time: String(hit[TIME] || ""), hours: num(hit[HRS]) } : null,
    });
    if (!hit) {
      res.status = "anomaly";
      res.anomalies.push({ field: "ot_record", expected: `${date} ${start}-${end}`,
        found: "查無對應紀錄", note: "OT Data 中找不到相符的日期/時間" });
      continue;
    }
    const approvedHrs = num(hit[HRS]);
    if (hrs && Math.abs(hrs - approvedHrs) > 0.1) {
      res.status = "anomaly";
      res.anomalies.push({ field: "ot_hours", expected: `${approvedHrs}hrs`,
        found: `${hrs}hrs`, note: `填寫時數與 Approval 不符（${date}）` });
    }
  }
  return res;
}

// ── Night Shift ────────────────────────────────────────────────────────────────
export function verifyNs(wb, empEn, empCn, tabNs) {
  const ws = wb.Sheets["OT_Shift_01June26"];
  const res = { emp: empEn, status: "not_found", matched_rows: 0, anomalies: [],
                template_dates: [], keyed_dates: [], details: [] };
  if (!ws) return res;
  const rows = sheetRows(ws);
  const NAME = 1, STATUS = 5, DATE = 16, TIME = 17;

  const matched = dedup(
    [...iterApproved(rows, NAME, STATUS, empEn, empCn)],
    r => `${parseDate(r[DATE])}|${String(r[TIME] || "").trim()}`
  );
  res.template_dates = [...new Set(matched.map(r => parseDate(r[DATE])).filter(Boolean))].sort();
  if (!matched.length) return res;
  res.matched_rows = matched.length;
  res.status = "ok";

  // accept both new ns[].amount and legacy ess[].ns_amount shapes
  const nsEntries = tabNs.filter(e => num(e.amount) > 0 || num(e.ns_amount) > 0);
  for (const t of nsEntries) {
    const date = t.date || "", start = t.tstart || "", end = t.tend || "";
    if (date) res.keyed_dates.push(date);
    let hit = null;
    for (const r of matched) {
      if (parseDate(r[DATE]) !== date) continue;
      const rt = parseTimeRange(String(r[TIME] || ""));
      if (rt && rt[0] === start && rt[1] === end) { hit = r; break; }
      if (rt === null) { hit = r; break; }
    }
    res.details.push({
      keyed: { date, start, end, amount: num(t.amount) || num(t.ns_amount) },
      approval: hit ? { date: parseDate(hit[DATE]), time: String(hit[TIME] || "") } : null,
    });
    if (!hit) {
      res.status = "anomaly";
      res.anomalies.push({ field: "ns_record", expected: `${date} ${start}-${end}`,
        found: "查無對應 Night Shift 紀錄", note: "OT_Shift sheet 中找不到相符的日期/時間" });
    }
  }
  return res;
}

// ── ESS ROTA ───────────────────────────────────────────────────────────────────
export function verifyEss(wb, empEn, empCn, tabEss, tabEssTotal) {
  const ws = wb.Sheets["明細"];
  const res = { emp: empEn, status: "not_found", matched_rows: 0, anomalies: [],
                template_dates: [], keyed_dates: [], details: [] };
  if (!ws) return res;
  const rows = sheetRows(ws);
  const NAME = 1, DATE = 3, AMT = 7;

  // 明細: header row 2 (index 1), data from row 3 (index 2)
  const rota = {};
  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const cellName = row.length > NAME ? row[NAME] : null;
    if (!nameMatch(cellName, empEn, empCn)) continue;
    const d = parseDate(row.length > DATE ? row[DATE] : null);
    const amt = num(row.length > AMT ? row[AMT] : 0);
    if (d) rota[d] = (rota[d] || 0) + amt;
  }
  const rotaDates = Object.keys(rota);
  res.template_dates = rotaDates.sort();
  if (!rotaDates.length) return res;
  res.matched_rows = rotaDates.length;
  res.status = "ok";

  const tabDates = new Set();
  for (const e of tabEss) for (const d of expandDates(e)) tabDates.add(d);
  res.keyed_dates = [...tabDates].sort();

  for (const d of [...tabDates].sort()) {
    if (!(d in rota)) {
      res.status = "anomaly";
      res.anomalies.push({ field: "ess_date", expected: d,
        found: "不在 ROTA 排班表中", note: `${d} 未出現在 ESS ROTA 明細，請確認排班` });
    }
  }

  let rotaSum = 0;
  for (const [k, v] of Object.entries(rota)) if (tabDates.has(k)) rotaSum += v;
  if (tabEssTotal && Math.abs(rotaSum - tabEssTotal) > 1) {
    res.status = "anomaly";
    res.anomalies.push({ field: "ess_amount",
      expected: `${fmtNT(tabEssTotal)}（填寫值）`, found: `${fmtNT(rotaSum)}（ROTA 計算值）`,
      note: `金額差異 ${fmtNT(Math.abs(rotaSum - tabEssTotal))}，請核對費率（平日 100／假日 500）` });
  }
  return res;
}

// ── gap (遺漏) + cross-month duplicate (重複) detection ────────────────────────

// Given a verify category result (with template_dates & keyed_dates),
// return dates the approval template has but the user did NOT key in.
function findMissing(catResult) {
  if (!catResult) return [];
  const keyed = new Set(catResult.keyed_dates || []);
  return (catResult.template_dates || []).filter(d => d && !keyed.has(d)).sort();
}

// Build the set of dates a historical form covers for one category key.
// catKey: "ta" | "ess" | "ot" | "ns"
function datesFromForm(form, catKey) {
  const out = [];
  const arr = Array.isArray(form?.[catKey]) ? form[catKey] : [];
  for (const e of arr) {
    if (catKey === "ot" || catKey === "ns") {
      if (e.date) out.push(parseDate(e.date));
    } else {
      for (const d of expandDates(e)) out.push(d);
    }
  }
  return out;
}

// Compare this month's keyed dates against prior months' history.
// history: { "2026-P04": form, ... }. Returns [{date, period}] duplicates.
function findDuplicates(keyedDates, history, catKey) {
  const dups = [];
  const keyed = new Set(keyedDates || []);
  for (const [period, form] of Object.entries(history || {})) {
    const prior = new Set(datesFromForm(form, catKey));
    for (const d of keyed) {
      if (prior.has(d)) dups.push({ date: d, period });
    }
  }
  return dups;
}

// ── orchestrator: verify one employee against whichever files were provided ────
// workbooks: { travel?, ot?, ess? } already-parsed SheetJS workbooks (shared across emps)
// history:   { period: form } from prior months (optional) for duplicate detection
export function verifyEmployee(workbooks, empEn, empCn, tab, history = {}) {
  const out = {};
  if (workbooks.travel) {
    out.travel = verifyTravel(workbooks.travel, empEn, empCn, tab.ta || []);
    out.travel.missing = findMissing(out.travel);
    out.travel.duplicates = findDuplicates(out.travel.keyed_dates, history, "ta");
  }
  if (workbooks.ot) {
    out.ot = verifyOt(workbooks.ot, empEn, empCn, tab.ot || []);
    out.ot.missing = findMissing(out.ot);
    out.ot.duplicates = findDuplicates(out.ot.keyed_dates, history, "ot");

    out.ns = verifyNs(workbooks.ot, empEn, empCn, tab.ns || tab.ess || []);
    out.ns.missing = findMissing(out.ns);
    out.ns.duplicates = findDuplicates(out.ns.keyed_dates, history, "ns");
  }
  if (workbooks.ess) {
    const essTotal = (tab.ess || []).reduce((a, e) => a + num(e.amount), 0);
    out.ess = verifyEss(workbooks.ess, empEn, empCn, tab.ess || [], essTotal);
    out.ess.missing = findMissing(out.ess);
    out.ess.duplicates = findDuplicates(out.ess.keyed_dates, history, "ess");
  }
  return out;
}
