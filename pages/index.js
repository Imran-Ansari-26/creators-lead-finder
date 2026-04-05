import { useState, useRef, useCallback, useEffect } from "react";
import Head from "next/head";

// ─── Theme ────────────────────────────────────────────────────────────────────
const C = {
  bg: "#08090d", s0: "#0d0e14", s1: "#12131c", s2: "#181926",
  border: "#21233a", borderHi: "#343660",
  accent: "#4f6ef7", accentLo: "#1e2a6e", accentGlow: "rgba(79,110,247,0.12)",
  green: "#34d98a", greenLo: "#0d3324",
  amber: "#f5a623", amberLo: "#3d2700",
  red: "#f04d4d", redLo: "#3d0d0d",
  purple: "#a78bfa", purpleLo: "#2d1b69",
  cyan: "#22d3ee", cyanLo: "#0c3040",
  tp: "#e8eaff", ts: "#8890bb", tt: "#40446a",
};

const FIT = {
  "Strong fit":   { color: C.green,  bg: C.greenLo,  label: "STRONG FIT"   },
  "Possible fit": { color: C.amber,  bg: C.amberLo,  label: "POSSIBLE FIT" },
  "Weak fit":     { color: C.red,    bg: C.redLo,    label: "WEAK FIT"     },
};

const OUTREACH_STATUSES = [
  { id: "not_contacted", label: "Not Contacted",   color: C.tt,     bg: C.s2       },
  { id: "contacted",     label: "Contacted",        color: C.cyan,   bg: C.cyanLo   },
  { id: "follow_up",     label: "Follow-up Sent",   color: C.amber,  bg: C.amberLo  },
  { id: "replied",       label: "Replied",           color: C.green,  bg: C.greenLo  },
  { id: "closed",        label: "Closed / Won",      color: C.purple, bg: C.purpleLo },
  { id: "no_interest",   label: "No Interest",       color: C.red,    bg: C.redLo    },
];

// ─── Image Compression ────────────────────────────────────────────────────────
function compressImage(file, maxWidth = 1280, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement("canvas");
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      const base64 = canvas.toDataURL("image/jpeg", quality).split(",")[1];
      resolve({ base64, mediaType: "image/jpeg" });
    };
    img.onerror = () => reject(new Error("Could not load image"));
    img.src = url;
  });
}

// ─── API call (server-side via Next.js route) ─────────────────────────────────
async function analyseCreator(input, type) {
  const body = type === "screenshot"
    ? { type: "screenshot", imageBase64: input.base64, mediaType: input.mediaType }
    : { type: "url", url: input.url, context: input.context };

  const res = await fetch("/api/analyse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);
  return data;
}

// ─── localStorage persistence ─────────────────────────────────────────────────
const LS_LEADS    = "clf_leads";
const LS_OUTREACH = "clf_outreach";

function lsGet(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function lsSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

// ─── Export CSV ───────────────────────────────────────────────────────────────
function exportCSV(leads) {
  const cols = ["channel_name","subscriber_count","niche","has_product","product_type",
                "avg_views","last_post","posting_frequency","editing_quality",
                "fit_score","fit_reason","email_hook"];
  const rows = leads.map(l =>
    cols.map(k => `"${String(l[k] ?? "").replace(/"/g, '""')}"`).join(",")
  );
  const blob = new Blob([[cols.join(","), ...rows].join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "creator_leads.csv";
  a.click();
}

// ─── Small UI components ──────────────────────────────────────────────────────
function Dot({ color }) {
  return <span style={{ display:"inline-block", width:7, height:7, borderRadius:"50%",
    background:color, marginRight:6, flexShrink:0 }} />;
}

function Badge({ score }) {
  const f = FIT[score] || FIT["Weak fit"];
  return (
    <span style={{ display:"inline-flex", alignItems:"center", padding:"2px 9px",
      borderRadius:20, fontSize:10, fontWeight:800, letterSpacing:"0.07em",
      background:f.bg, color:f.color, border:`1px solid ${f.color}30` }}>
      <Dot color={f.color} />{f.label}
    </span>
  );
}

function StatusBadge({ statusId }) {
  const s = OUTREACH_STATUSES.find(x => x.id === statusId) || OUTREACH_STATUSES[0];
  return (
    <span style={{ display:"inline-flex", alignItems:"center", padding:"2px 9px",
      borderRadius:20, fontSize:10, fontWeight:800, letterSpacing:"0.07em",
      background:s.bg, color:s.color, border:`1px solid ${s.color}30` }}>
      <Dot color={s.color} />{s.label}
    </span>
  );
}

function Chip({ label, value, accent }) {
  return (
    <div style={{ padding:"5px 11px", borderRadius:7, background:C.s1,
      border:`1px solid ${C.border}`, display:"flex", flexDirection:"column", gap:2, minWidth:72 }}>
      <span style={{ fontSize:9, color:C.tt, textTransform:"uppercase", letterSpacing:"0.07em" }}>{label}</span>
      <span style={{ fontSize:12, fontWeight:700, color: accent || C.tp }}>{value || "—"}</span>
    </div>
  );
}

// ─── Drop Zone ────────────────────────────────────────────────────────────────
function DropZone({ onFiles, disabled }) {
  const [drag, setDrag] = useState(false);
  const inputId = "dz-upload";

  const handle = (files) => {
    const imgs = Array.from(files).filter(f => f.type.startsWith("image/"));
    if (imgs.length) onFiles(imgs);
  };

  return (
    <label
      htmlFor={inputId}
      onDragOver={e => { e.preventDefault(); if (!disabled) setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); if (!disabled) handle(e.dataTransfer.files); }}
      style={{
        display:"block", border:`2px dashed ${drag ? C.accent : C.borderHi}`,
        borderRadius:12, padding:"32px 20px", textAlign:"center",
        cursor: disabled ? "not-allowed" : "pointer",
        background: drag ? C.accentGlow : "rgba(79,110,247,0.03)",
        opacity: disabled ? 0.6 : 1, transition:"all 0.18s", userSelect:"none",
      }}
    >
      <input
        id={inputId} type="file" accept="image/*" multiple disabled={disabled}
        style={{ display:"none" }}
        onChange={e => { handle(e.target.files); e.target.value = ""; }}
      />
      {disabled ? (
        <>
          <div style={{ fontSize:28, marginBottom:8 }}>⏳</div>
          <div style={{ fontSize:13, fontWeight:800, color:C.accent, marginBottom:4 }}>Analysing with AI…</div>
          <div style={{ fontSize:11, color:C.ts }}>Please wait, this takes a few seconds per image</div>
        </>
      ) : (
        <>
          <div style={{ fontSize:32, marginBottom:10 }}>🎯</div>
          <div style={{ fontSize:14, fontWeight:800, color:C.tp, marginBottom:6 }}>Click anywhere here to upload</div>
          <div style={{ fontSize:12, color:C.ts, marginBottom:14, lineHeight:1.6 }}>
            Screenshot a YouTube channel page — AI will score fit,<br/>
            analyse editing quality, and write a personalised DM hook.
          </div>
          <span style={{ display:"inline-block", background:C.accent, color:"#fff",
            borderRadius:8, padding:"9px 22px", fontSize:12, fontWeight:800,
            letterSpacing:"0.03em", pointerEvents:"none" }}>
            📂 Browse Images
          </span>
          <div style={{ fontSize:10, color:C.tt, marginTop:10 }}>PNG or JPG · drop or click · select multiple at once</div>
        </>
      )}
    </label>
  );
}

// ─── Lead Card ────────────────────────────────────────────────────────────────
function LeadCard({ lead, globalIndex, onRemove, onAddToOutreach, alreadyInOutreach }) {
  const [open, setOpen] = useState(false);
  const f = FIT[lead.fit_score] || FIT["Weak fit"];
  return (
    <div style={{ background:C.s1, border:`1px solid ${C.border}`, borderRadius:11,
      overflow:"hidden", transition:"border-color 0.15s" }}
      onMouseEnter={e => e.currentTarget.style.borderColor = C.borderHi}
      onMouseLeave={e => e.currentTarget.style.borderColor = C.border}>

      <div style={{ display:"flex", alignItems:"center", gap:12, padding:"13px 16px", cursor:"pointer" }}
        onClick={() => setOpen(o => !o)}>
        <div style={{ width:33, height:33, borderRadius:9, flexShrink:0,
          background:f.bg, border:`1px solid ${f.color}40`,
          display:"flex", alignItems:"center", justifyContent:"center",
          fontSize:13, fontWeight:900, color:f.color }}>{globalIndex + 1}</div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
            <span style={{ fontSize:14, fontWeight:800, color:C.tp }}>{lead.channel_name}</span>
            <Badge score={lead.fit_score} />
          </div>
          <div style={{ fontSize:11, color:C.ts, marginTop:2 }}>
            {lead.niche} · {lead.subscriber_count} subs {lead.avg_views ? `· ~${lead.avg_views} views` : ""}
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <button onClick={e => { e.stopPropagation(); onAddToOutreach(lead); }}
            disabled={alreadyInOutreach}
            style={{ background: alreadyInOutreach ? C.s2 : C.accentGlow,
              border:`1px solid ${alreadyInOutreach ? C.border : C.accentLo}`,
              color: alreadyInOutreach ? C.tt : C.accent,
              borderRadius:6, padding:"4px 10px", fontSize:10, fontWeight:700,
              cursor: alreadyInOutreach ? "not-allowed" : "pointer", whiteSpace:"nowrap" }}>
            {alreadyInOutreach ? "In CRM ✓" : "+ Outreach"}
          </button>
          <span style={{ fontSize:10, color:C.tt }}>{open ? "▲" : "▼"}</span>
          <button onClick={e => { e.stopPropagation(); onRemove(); }}
            style={{ background:"none", border:"none", color:C.tt, cursor:"pointer",
              fontSize:18, lineHeight:1, padding:"0 4px" }}>×</button>
        </div>
      </div>

      {open && (
        <div style={{ borderTop:`1px solid ${C.border}`, padding:"13px 16px",
          display:"flex", flexDirection:"column", gap:10 }}>
          <div style={{ display:"flex", gap:7, flexWrap:"wrap" }}>
            <Chip label="Subs" value={lead.subscriber_count} />
            <Chip label="Last post" value={lead.last_post} />
            <Chip label="Frequency" value={lead.posting_frequency} />
            <Chip label="Editing" value={lead.editing_quality}
              accent={lead.editing_quality === "basic" ? C.green : lead.editing_quality === "moderate" ? C.amber : C.red} />
            <Chip label="Product" value={lead.has_product ? (lead.product_type || "Yes ✓") : "None"}
              accent={lead.has_product ? C.green : C.red} />
          </div>
          <div style={{ background:C.s2, border:`1px solid ${C.border}`, borderRadius:8, padding:"10px 13px" }}>
            <div style={{ fontSize:9, color:C.tt, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:5 }}>
              Scoring rationale
            </div>
            <div style={{ fontSize:12, color:C.ts, lineHeight:1.65 }}>{lead.fit_reason}</div>
          </div>
          <div style={{ background:C.accentGlow, border:`1px solid ${C.accentLo}`, borderRadius:8, padding:"10px 13px" }}>
            <div style={{ fontSize:9, color:C.accent, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:5 }}>
              📩 Email / DM hook
            </div>
            <div style={{ fontSize:12, color:C.tp, lineHeight:1.65, fontStyle:"italic" }}>"{lead.email_hook}"</div>
            <button onClick={() => navigator.clipboard?.writeText(lead.email_hook)}
              style={{ marginTop:8, background:"none", border:`1px solid ${C.borderHi}`,
                borderRadius:5, padding:"3px 10px", fontSize:10, color:C.ts, cursor:"pointer" }}>
              Copy hook
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Outreach Card ────────────────────────────────────────────────────────────
function OutreachCard({ entry, onUpdate, onRemove }) {
  const [open, setOpen]   = useState(false);
  const [note, setNote]   = useState("");
  const status = OUTREACH_STATUSES.find(s => s.id === entry.status) || OUTREACH_STATUSES[0];

  const addNote = () => {
    if (!note.trim()) return;
    onUpdate({ ...entry,
      notes: [...(entry.notes || []), { text: note.trim(), date: new Date().toLocaleDateString(), id: Date.now() }]
    });
    setNote("");
  };

  const setStatus = (id) => onUpdate({ ...entry, status: id, lastUpdated: new Date().toLocaleDateString() });

  const scheduleFollowUp = () => {
    const date = window.prompt("Follow-up date (e.g. Apr 20):");
    if (date) onUpdate({ ...entry, followUpDate: date, status: "follow_up",
      lastUpdated: new Date().toLocaleDateString() });
  };

  return (
    <div style={{ background:C.s1, border:`1px solid ${status.color}30`, borderRadius:11,
      overflow:"hidden", transition:"border-color 0.15s" }}
      onMouseEnter={e => e.currentTarget.style.borderColor = status.color + "60"}
      onMouseLeave={e => e.currentTarget.style.borderColor = status.color + "30"}>

      <div style={{ display:"flex", alignItems:"center", gap:12, padding:"13px 16px", cursor:"pointer" }}
        onClick={() => setOpen(o => !o)}>
        <div style={{ width:33, height:33, borderRadius:9, flexShrink:0,
          background:status.bg, border:`1px solid ${status.color}40`,
          display:"flex", alignItems:"center", justifyContent:"center", fontSize:15 }}>
          {status.id === "closed" ? "🏆" : status.id === "replied" ? "💬" : status.id === "no_interest" ? "🚫" : "📤"}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
            <span style={{ fontSize:14, fontWeight:800, color:C.tp }}>{entry.channel_name}</span>
            <StatusBadge statusId={entry.status} />
            {entry.fit_score && <Badge score={entry.fit_score} />}
          </div>
          <div style={{ fontSize:11, color:C.ts, marginTop:2 }}>
            {entry.niche} · {entry.subscriber_count}
            {entry.followUpDate && <span style={{ color:C.amber, marginLeft:8 }}>📅 Follow-up: {entry.followUpDate}</span>}
            {entry.lastUpdated  && <span style={{ color:C.tt, marginLeft:8 }}>Updated {entry.lastUpdated}</span>}
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ fontSize:10, color:C.tt }}>{open ? "▲" : "▼"}</span>
          <button onClick={e => { e.stopPropagation(); onRemove(); }}
            style={{ background:"none", border:"none", color:C.tt, cursor:"pointer",
              fontSize:18, lineHeight:1, padding:"0 4px" }}>×</button>
        </div>
      </div>

      {open && (
        <div style={{ borderTop:`1px solid ${C.border}`, padding:"14px 16px",
          display:"flex", flexDirection:"column", gap:13 }}>

          {/* Status picker */}
          <div>
            <div style={{ fontSize:9, color:C.tt, textTransform:"uppercase",
              letterSpacing:"0.07em", marginBottom:8 }}>Outreach Status</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
              {OUTREACH_STATUSES.map(s => (
                <button key={s.id} onClick={() => setStatus(s.id)}
                  style={{ padding:"5px 12px", borderRadius:20, fontSize:10, fontWeight:700,
                    border:`1px solid ${entry.status === s.id ? s.color : C.border}`,
                    background: entry.status === s.id ? s.bg : "transparent",
                    color: entry.status === s.id ? s.color : C.ts,
                    cursor:"pointer", transition:"all 0.15s" }}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            <button onClick={() => navigator.clipboard?.writeText(entry.email_hook || "")}
              style={{ background:C.accentGlow, border:`1px solid ${C.accentLo}`,
                color:C.accent, borderRadius:7, padding:"6px 13px", fontSize:11, fontWeight:700, cursor:"pointer" }}>
              📋 Copy DM Hook
            </button>
            <button onClick={scheduleFollowUp}
              style={{ background:C.amberLo, border:`1px solid ${C.amber}40`,
                color:C.amber, borderRadius:7, padding:"6px 13px", fontSize:11, fontWeight:700, cursor:"pointer" }}>
              📅 Schedule Follow-up
            </button>
            {entry.followUpDate && (
              <button onClick={() => onUpdate({ ...entry, followUpDate: null })}
                style={{ background:"transparent", border:`1px solid ${C.border}`,
                  color:C.tt, borderRadius:7, padding:"6px 13px", fontSize:11, cursor:"pointer" }}>
                Clear Follow-up
              </button>
            )}
          </div>

          {/* DM Hook */}
          {entry.email_hook && (
            <div style={{ background:C.accentGlow, border:`1px solid ${C.accentLo}`,
              borderRadius:8, padding:"10px 13px" }}>
              <div style={{ fontSize:9, color:C.accent, textTransform:"uppercase",
                letterSpacing:"0.07em", marginBottom:5 }}>📩 DM Hook</div>
              <div style={{ fontSize:12, color:C.tp, lineHeight:1.65, fontStyle:"italic" }}>
                "{entry.email_hook}"
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <div style={{ fontSize:9, color:C.tt, textTransform:"uppercase",
              letterSpacing:"0.07em", marginBottom:8 }}>Notes & Activity</div>
            {(entry.notes || []).length === 0 && (
              <div style={{ fontSize:11, color:C.tt, marginBottom:8 }}>No notes yet.</div>
            )}
            {(entry.notes || []).map(n => (
              <div key={n.id} style={{ background:C.s2, border:`1px solid ${C.border}`,
                borderRadius:7, padding:"7px 11px", marginBottom:6,
                display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8 }}>
                <span style={{ fontSize:12, color:C.ts, lineHeight:1.5, flex:1 }}>{n.text}</span>
                <span style={{ fontSize:10, color:C.tt, flexShrink:0 }}>{n.date}</span>
              </div>
            ))}
            <div style={{ display:"flex", gap:7, marginTop:6 }}>
              <input value={note} onChange={e => setNote(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addNote()}
                placeholder="Add a note… (Enter to save)"
                style={{ flex:1, background:C.s2, border:`1px solid ${C.border}`,
                  borderRadius:7, padding:"7px 11px", color:C.tp, fontSize:12 }} />
              <button onClick={addNote}
                style={{ background:C.accent, color:"#fff", border:"none",
                  borderRadius:7, padding:"7px 14px", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                Add
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Home() {
  const [leads,    setLeads]    = useState([]);
  const [outreach, setOutreach] = useState({});
  const [busy,     setBusy]     = useState(false);
  const [progress, setProgress] = useState({ done:0, total:0, current:"" });
  const [mainTab,  setMainTab]  = useState("leads");
  const [tab,      setTab]      = useState("screenshot");
  const [urlText,  setUrlText]  = useState("");
  const [ctx,      setCtx]      = useState("");
  const [err,      setErr]      = useState("");
  const [loaded,   setLoaded]   = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    setLeads(lsGet(LS_LEADS, []));
    setOutreach(lsGet(LS_OUTREACH, {}));
    setLoaded(true);
  }, []);

  // Persist on change
  useEffect(() => { if (loaded) lsSet(LS_LEADS, leads); }, [leads, loaded]);
  useEffect(() => { if (loaded) lsSet(LS_OUTREACH, outreach); }, [outreach, loaded]);

  const runItems = useCallback(async (items) => {
    setBusy(true); setErr("");
    setProgress({ done:0, total:items.length, current: items[0]?.label || "" });
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      setProgress({ done:i, total:items.length, current:item.label });
      try {
        const result = await analyseCreator(item.data, item.type);
        setLeads(prev => [...prev, { ...result, _id: Date.now() + Math.random() }]);
        setErr("");
      } catch (e) {
        console.error(e);
        setErr(`❌ Failed on "${item.label}": ${e.message}`);
      }
    }
    setProgress(p => ({ ...p, done:p.total, current:"" }));
    setBusy(false);
  }, []);

  const handleScreenshots = useCallback(async (files) => {
    if (!files || files.length === 0) return;
    setErr(""); setBusy(true);
    try {
      const items = await Promise.all(Array.from(files).map(async f => {
        const compressed = await compressImage(f);
        return { type:"screenshot", label:f.name, data:compressed };
      }));
      await runItems(items);
    } catch (e) {
      setErr("Failed to prepare images: " + e.message);
      setBusy(false);
    }
  }, [runItems]);

  const handleUrls = useCallback(() => {
    const urls = urlText.split("\n").map(s => s.trim()).filter(Boolean);
    if (!urls.length) return;
    setUrlText("");
    runItems(urls.map(url => ({ type:"url", label:url, data:{ url, context:ctx } })));
  }, [urlText, ctx, runItems]);

  const addToOutreach  = useCallback((lead) => {
    setOutreach(prev => ({
      ...prev,
      [lead._id]: { ...lead, status:"not_contacted", notes:[], followUpDate:null,
        addedDate:new Date().toLocaleDateString(), lastUpdated:null }
    }));
  }, []);

  const updateOutreach = useCallback((id, updated) => {
    setOutreach(prev => ({ ...prev, [id]: updated }));
  }, []);

  const removeOutreach = useCallback((id) => {
    setOutreach(prev => { const n = { ...prev }; delete n[id]; return n; });
  }, []);

  const strong       = leads.filter(l => l.fit_score === "Strong fit");
  const possible     = leads.filter(l => l.fit_score === "Possible fit");
  const weak         = leads.filter(l => l.fit_score === "Weak fit");
  const outreachList = Object.values(outreach);
  const pct          = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  const statusCounts = OUTREACH_STATUSES.map(s => ({
    ...s, count: outreachList.filter(e => e.status === s.id).length
  })).filter(s => s.count > 0);

  if (!loaded) return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex",
      alignItems:"center", justifyContent:"center", color:C.ts }}>
      <div style={{ textAlign:"center" }}>
        <div style={{ fontSize:32, marginBottom:10 }}>🎯</div>
        <div style={{ fontSize:14, fontWeight:700 }}>Loading your data…</div>
      </div>
    </div>
  );

  return (
    <>
      <Head>
        <title>Creator Lead Finder</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div style={{ minHeight:"100vh", background:C.bg, color:C.tp,
        fontFamily:"'DM Sans','Segoe UI',sans-serif", paddingBottom:60 }}>

        {/* Header */}
        <div style={{ background:C.s0, borderBottom:`1px solid ${C.border}`,
          padding:"18px 28px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ width:36, height:36, borderRadius:9, background:C.accentGlow,
              border:`1px solid ${C.accentLo}`, display:"flex", alignItems:"center",
              justifyContent:"center", fontSize:18 }}>🎯</div>
            <div>
              <div style={{ fontSize:17, fontWeight:800, letterSpacing:"-0.02em" }}>Creator Lead Finder</div>
              <div style={{ fontSize:11, color:C.tt }}>AI-powered YouTube outreach scoring · data saved locally</div>
            </div>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            {leads.length > 0 && (
              <button onClick={() => exportCSV(leads)}
                style={{ background:"transparent", color:C.ts, border:`1px solid ${C.border}`,
                  borderRadius:8, padding:"7px 14px", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                Export CSV ↓
              </button>
            )}
            {leads.length > 0 && (
              <button onClick={() => { if (window.confirm("Clear all leads?")) setLeads([]); }}
                style={{ background:"transparent", color:C.red, border:`1px solid ${C.red}40`,
                  borderRadius:8, padding:"7px 14px", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                Clear Leads
              </button>
            )}
          </div>
        </div>

        {/* Main Tab Bar */}
        <div style={{ background:C.s0, borderBottom:`1px solid ${C.border}`,
          display:"flex", padding:"0 28px" }}>
          {[
            { id:"leads",    icon:"🔍", label:"Lead Finder",  count:leads.length },
            { id:"outreach", icon:"📤", label:"Outreach CRM", count:outreachList.length },
          ].map(t => (
            <button key={t.id} onClick={() => setMainTab(t.id)} style={{
              padding:"12px 20px", background:"transparent",
              border:"none", borderBottom: mainTab===t.id ? `2px solid ${C.accent}` : "2px solid transparent",
              color: mainTab===t.id ? C.tp : C.ts,
              fontSize:13, fontWeight:700, cursor:"pointer", transition:"all 0.15s",
              display:"flex", alignItems:"center", gap:7 }}>
              {t.icon} {t.label}
              {t.count > 0 && (
                <span style={{ background: mainTab===t.id ? C.accent : C.border,
                  color: mainTab===t.id ? "#fff" : C.ts,
                  borderRadius:20, padding:"1px 7px", fontSize:10, fontWeight:800 }}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        <div style={{ maxWidth:860, margin:"0 auto", padding:"24px 18px" }}>

          {/* ── LEAD FINDER TAB ── */}
          {mainTab === "leads" && (
            <>
              {/* Stats */}
              {leads.length > 0 && (
                <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:24 }}>
                  {[
                    { label:"Strong fit",   count:strong.length,   color:C.green,  bg:C.greenLo  },
                    { label:"Possible fit", count:possible.length, color:C.amber,  bg:C.amberLo  },
                    { label:"Weak fit",     count:weak.length,     color:C.red,    bg:C.redLo    },
                  ].map(s => (
                    <div key={s.label} style={{ background:s.bg, border:`1px solid ${s.color}33`,
                      borderRadius:9, padding:"13px 16px", display:"flex", alignItems:"center", gap:12 }}>
                      <div style={{ fontSize:26, fontWeight:900, color:s.color, lineHeight:1 }}>{s.count}</div>
                      <div style={{ fontSize:10, color:s.color, textTransform:"uppercase",
                        letterSpacing:"0.07em" }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Input Panel */}
              <div style={{ background:C.s1, border:`1px solid ${C.border}`,
                borderRadius:13, overflow:"hidden", marginBottom:24 }}>
                <div style={{ display:"flex", borderBottom:`1px solid ${C.border}` }}>
                  {[
                    { id:"screenshot", icon:"📸", label:"Screenshots"  },
                    { id:"url",        icon:"🔗", label:"Channel URLs"  },
                  ].map(t => (
                    <button key={t.id} onClick={() => setTab(t.id)} style={{
                      flex:1, padding:"12px 16px",
                      background: tab===t.id ? C.s2 : "transparent",
                      border:"none",
                      borderBottom: tab===t.id ? `2px solid ${C.accent}` : "2px solid transparent",
                      color: tab===t.id ? C.tp : C.ts,
                      fontSize:12, fontWeight:700, cursor:"pointer", transition:"all 0.15s" }}>
                      {t.icon}  {t.label}
                    </button>
                  ))}
                </div>

                <div style={{ padding:18 }}>
                  {tab === "screenshot" ? (
                    <DropZone onFiles={handleScreenshots} disabled={busy} />
                  ) : (
                    <>
                      <p style={{ fontSize:12, color:C.ts, marginTop:0, marginBottom:10, lineHeight:1.6 }}>
                        Paste YouTube channel URLs (one per line).
                      </p>
                      <textarea value={urlText} onChange={e => setUrlText(e.target.value)}
                        placeholder={"https://youtube.com/@creatorname\nhttps://youtube.com/@another"}
                        style={{ width:"100%", minHeight:80, background:C.s2,
                          border:`1px solid ${C.border}`, borderRadius:8, padding:"9px 12px",
                          color:C.tp, fontSize:12, fontFamily:"'DM Mono',monospace",
                          resize:"vertical", marginBottom:8 }} />
                      <textarea value={ctx} onChange={e => setCtx(e.target.value)}
                        placeholder="Optional context: e.g. 'sells a coaching programme, posts weekly'"
                        style={{ width:"100%", minHeight:48, background:C.s2,
                          border:`1px solid ${C.border}`, borderRadius:8, padding:"9px 12px",
                          color:C.tp, fontSize:12, resize:"vertical", marginBottom:10 }} />
                      <button onClick={handleUrls} disabled={busy || !urlText.trim()} style={{
                        background: (busy || !urlText.trim()) ? C.accentLo : C.accent,
                        color:"#fff", border:"none", borderRadius:8, padding:"9px 20px",
                        fontSize:12, fontWeight:800,
                        cursor: busy ? "not-allowed" : "pointer",
                        opacity: !urlText.trim() ? 0.5 : 1 }}>
                        {busy ? "Analysing…" : "Analyse channels →"}
                      </button>
                    </>
                  )}

                  {/* Progress */}
                  {busy && (
                    <div style={{ marginTop:14 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:9, marginBottom:7 }}>
                        <span style={{ width:13, height:13, border:`2px solid ${C.accentLo}`,
                          borderTopColor:C.accent, borderRadius:"50%", display:"inline-block",
                          animation:"spin 0.7s linear infinite" }} />
                        <span style={{ fontSize:12, color:C.accent, fontWeight:600 }}>
                          Analysing {progress.current ? `"${progress.current.slice(0,40)}"` : "…"} ({progress.done}/{progress.total})
                        </span>
                      </div>
                      <div style={{ height:4, background:C.s2, borderRadius:4, overflow:"hidden" }}>
                        <div style={{ height:"100%", width:`${pct}%`,
                          background:C.accent, borderRadius:4, transition:"width 0.3s" }} />
                      </div>
                    </div>
                  )}

                  {/* Error */}
                  {err && (
                    <div style={{ marginTop:12, padding:"12px 14px", background:C.redLo,
                      border:`1px solid ${C.red}55`, borderRadius:9, fontSize:12,
                      color:C.red, lineHeight:1.6 }}>
                      <div style={{ fontWeight:800, marginBottom:4 }}>⚠ Analysis Error</div>
                      <div>{err}</div>
                      <div style={{ marginTop:6, fontSize:11, color:C.ts }}>
                        Make sure the screenshot clearly shows the channel name, subscriber count, and recent videos.
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Results */}
              {leads.length > 0 ? (
                <div>
                  {[
                    { score:"Strong fit",   items:strong   },
                    { score:"Possible fit", items:possible },
                    { score:"Weak fit",     items:weak     },
                  ].filter(g => g.items.length > 0).map(group => (
                    <div key={group.score} style={{ marginBottom:24 }}>
                      <div style={{ fontSize:10, fontWeight:800, textTransform:"uppercase",
                        letterSpacing:"0.09em", color:FIT[group.score].color,
                        marginBottom:8, paddingLeft:2 }}>
                        <Dot color={FIT[group.score].color} />
                        {group.score} · {group.items.length} channel{group.items.length !== 1 ? "s" : ""}
                      </div>
                      <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
                        {group.items.map(lead => (
                          <div key={lead._id} style={{ animation:"fadeIn 0.25s ease" }}>
                            <LeadCard lead={lead} globalIndex={leads.indexOf(lead)}
                              onRemove={() => setLeads(p => p.filter(l => l._id !== lead._id))}
                              onAddToOutreach={addToOutreach}
                              alreadyInOutreach={!!outreach[lead._id]} />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : !busy && (
                <div style={{ textAlign:"center", padding:"56px 20px", color:C.tt }}>
                  <div style={{ fontSize:38, marginBottom:10 }}>📋</div>
                  <div style={{ fontWeight:800, color:C.ts, fontSize:15 }}>No leads analysed yet</div>
                  <div style={{ fontSize:12, marginTop:5, color:C.tt }}>
                    Drop screenshots or paste URLs to start scoring creators
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── OUTREACH CRM TAB ── */}
          {mainTab === "outreach" && (
            <>
              {outreachList.length > 0 && (
                <div style={{ marginBottom:22 }}>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",
                    gap:8, marginBottom:12 }}>
                    {statusCounts.map(s => (
                      <div key={s.id} style={{ background:s.bg, border:`1px solid ${s.color}33`,
                        borderRadius:9, padding:"11px 14px", display:"flex", alignItems:"center", gap:10 }}>
                        <div style={{ fontSize:22, fontWeight:900, color:s.color, lineHeight:1 }}>{s.count}</div>
                        <div style={{ fontSize:9, color:s.color, textTransform:"uppercase",
                          letterSpacing:"0.07em", lineHeight:1.3 }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                  {outreachList.filter(e => e.followUpDate).length > 0 && (
                    <div style={{ background:C.amberLo, border:`1px solid ${C.amber}40`,
                      borderRadius:9, padding:"11px 14px", display:"flex", alignItems:"center", gap:10 }}>
                      <span style={{ fontSize:16 }}>📅</span>
                      <div>
                        <div style={{ fontSize:12, fontWeight:700, color:C.amber }}>
                          {outreachList.filter(e => e.followUpDate).length} follow-up(s) scheduled
                        </div>
                        <div style={{ fontSize:11, color:C.ts, marginTop:2 }}>
                          {outreachList.filter(e => e.followUpDate)
                            .map(e => `${e.channel_name} → ${e.followUpDate}`).join(" · ")}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {outreachList.length === 0 ? (
                <div style={{ textAlign:"center", padding:"56px 20px", color:C.tt }}>
                  <div style={{ fontSize:38, marginBottom:10 }}>📤</div>
                  <div style={{ fontWeight:800, color:C.ts, fontSize:15 }}>No creators in your CRM yet</div>
                  <div style={{ fontSize:12, marginTop:5, color:C.tt }}>
                    Go to Lead Finder, analyse some creators, then click "+ Outreach"
                  </div>
                  <button onClick={() => setMainTab("leads")}
                    style={{ marginTop:16, background:C.accent, color:"#fff", border:"none",
                      borderRadius:8, padding:"9px 20px", fontSize:12, fontWeight:800, cursor:"pointer" }}>
                    Go to Lead Finder →
                  </button>
                </div>
              ) : (
                <div>
                  {OUTREACH_STATUSES.map(s => {
                    const items = outreachList.filter(e => e.status === s.id);
                    if (!items.length) return null;
                    return (
                      <div key={s.id} style={{ marginBottom:28 }}>
                        <div style={{ fontSize:10, fontWeight:800, textTransform:"uppercase",
                          letterSpacing:"0.09em", color:s.color, marginBottom:9, paddingLeft:2 }}>
                          <Dot color={s.color} />{s.label} · {items.length}
                        </div>
                        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                          {items.map(entry => (
                            <div key={entry._id} style={{ animation:"fadeIn 0.25s ease" }}>
                              <OutreachCard entry={entry}
                                onUpdate={updated => updateOutreach(entry._id, updated)}
                                onRemove={() => removeOutreach(entry._id)} />
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
