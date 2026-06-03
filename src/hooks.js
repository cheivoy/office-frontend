import { useState, useCallback, useEffect, useRef } from "react";

export function useToast() {
  const [toast, setToast] = useState(null);
  const show = useCallback((msg, type = "info") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);
  const Toast = toast ? (
    <div className={`toast${toast.type === "err" ? " err" : toast.type === "ok" ? " ok" : ""}`}>
      {toast.msg}
    </div>
  ) : null;
  return { show, Toast };
}

export function useApi() {
  const [loading, setLoading] = useState(false);
  const run = useCallback(async (fn, onSuccess, onError) => {
    setLoading(true);
    try {
      const result = await fn();
      onSuccess && onSuccess(result);
    } catch (e) {
      onError && onError(e.message || "發生錯誤");
    } finally {
      setLoading(false);
    }
  }, []);
  return { loading, run };
}

export function useDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  return { open, setOpen, ref };
}
