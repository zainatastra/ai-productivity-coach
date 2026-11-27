/* Styles of the AI Publishing screens, scoped by the aip- prefix. Shared so other pages can reuse the editor. */
export const AIP_CSS = `
.aip-root { font-family: "Plus Jakarta Sans", sans-serif; color:#111827; max-width: 1080px; width:100%; margin:0 auto; padding-top:14px; padding-bottom:40px; }
.aip-head { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; margin-bottom:18px; }
.aip-title { font-size:22px; font-weight:800; letter-spacing:-.03em; margin:0; color:#0d1117; }
.aip-sub { font-size:12.5px; color:#6b7280; margin:4px 0 0; line-height:1.5; }
.aip-card { background:#fff; border:1px solid #e8eaee; border-radius:20px; padding:20px; margin-bottom:16px; box-shadow:0 8px 28px rgba(15,23,42,.04); }
.aip-card-head { display:flex; justify-content:space-between; align-items:flex-start; gap:14px; flex-wrap:wrap; margin-bottom:14px; }
.aip-h3 { display:flex; align-items:center; gap:8px; font-size:14px; font-weight:800; margin:0 0 12px; color:#0d1117; }
.aip-card-head .aip-h3 { margin-bottom:4px; }
.aip-help { font-size:12px; color:#6b7280; margin:0; max-width:560px; line-height:1.55; }
.aip-muted { color:#9ca3af; font-size:13px; padding:8px 0; }
.aip-label { display:block; font-size:11px; font-weight:700; letter-spacing:.04em; text-transform:uppercase; color:#6b7280; margin:0 0 6px; }
.aip-input { width:100%; height:42px; padding:0 14px; border:1.5px solid #e5e7eb; border-radius:12px; font-family:inherit; font-size:13px; color:#111827; background:#fff; outline:none; transition:border-color .15s, box-shadow .15s; }
.aip-input:focus { border-color:#78d2f5; box-shadow:0 0 0 3px rgba(120,210,245,.22); }
.aip-select { width:auto; min-width:160px; }
.aip-create-grid { display:grid; grid-template-columns:1fr 1fr auto; gap:12px; align-items:end; }
.aip-create-btn { height:42px; }
.aip-btn { display:inline-flex; align-items:center; justify-content:center; gap:7px; height:38px; padding:0 16px; border-radius:999px; border:1px solid #111; background:#111; color:#fff; font-family:inherit; font-size:12.5px; font-weight:700; cursor:pointer; white-space:nowrap; transition:background .15s, opacity .15s; }
.aip-btn:hover:not(:disabled) { background:#222; }
.aip-btn:disabled { opacity:.45; cursor:not-allowed; }
.aip-btn.ghost { background:#fff; color:#374151; border-color:#e5e7eb; }
.aip-btn.ghost:hover:not(:disabled) { background:#f5f5f5; }
.aip-btn.danger { background:#dc2626; border-color:#dc2626; }
.aip-btn.danger:hover { background:#b91c1c; }
.aip-row { display:flex; gap:8px; align-items:center; margin-top:4px; }
.aip-row.wrap { flex-wrap:wrap; margin-top:0; }
.aip-error-text { color:#dc2626; font-size:12.5px; font-weight:600; margin-top:10px; }
.aip-error { color:#dc2626; }
.aip-list { display:flex; flex-direction:column; gap:8px; }
.aip-item { display:flex; align-items:center; gap:14px; width:100%; text-align:left; padding:12px 14px; border:1px solid #eef0f3; border-radius:16px; background:#fafbfc; cursor:pointer; font-family:inherit; transition:background .15s, border-color .15s, transform .15s; }
.aip-item:hover { background:#fff; border-color:#d9dee5; transform:translateY(-1px); }
.aip-item-main { display:flex; flex-direction:column; min-width:0; flex:1; }
.aip-item-main strong { font-size:14px; color:#0d1117; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.aip-item-main span { font-size:12px; color:#6b7280; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.aip-item-side { display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end; }
.aip-logo { width:48px; height:48px; border-radius:14px; background:#f3f4f6; border:1px solid #e5e7eb; display:flex; align-items:center; justify-content:center; color:#6b7280; flex-shrink:0; }
.aip-logo.sm { width:38px; height:38px; border-radius:12px; }
.aip-pill { display:inline-flex; align-items:center; gap:5px; height:22px; padding:0 9px; border-radius:999px; font-size:10.5px; font-weight:700; margin-left:6px; white-space:nowrap; }
.aip-item-side .aip-pill, .aip-card-head .aip-pill { margin-left:0; }
.aip-pill.green { background:#dcfce7; color:#166534; }
.aip-pill.red { background:#fee2e2; color:#991b1b; }
.aip-pill.amber { background:#fef3c7; color:#92400e; }
.aip-pill.blue { background:#e0f2fe; color:#075985; }
.aip-pill.gray { background:#f3f4f6; color:#4b5563; }
.aip-tabs { display:inline-flex; background:#f3f4f6; border-radius:999px; padding:3px; }
.aip-tabs button { border:none; background:transparent; font-family:inherit; font-size:12px; font-weight:700; color:#6b7280; padding:6px 14px; border-radius:999px; cursor:pointer; }
.aip-tabs button.on { background:#fff; color:#111; box-shadow:0 1px 4px rgba(0,0,0,.08); }
.aip-back { display:inline-flex; align-items:center; gap:7px; height:34px; padding:0 14px; border-radius:999px; border:1px solid #e5e7eb; background:#fff; color:#4b5563; font-family:inherit; font-size:12px; font-weight:700; cursor:pointer; margin-bottom:14px; }
.aip-back:hover { background:#f5f5f5; }
.aip-provider-top { display:flex; align-items:center; gap:16px; flex-wrap:wrap; }
.aip-provider-main { flex:1; min-width:200px; }
.aip-provider-name { font-size:19px; font-weight:800; letter-spacing:-.03em; margin:0 0 4px; display:flex; align-items:center; flex-wrap:wrap; gap:6px; }
.aip-site { display:inline-flex; align-items:center; gap:6px; font-size:12.5px; color:#0369a1; text-decoration:none; font-weight:600; }
.aip-site:hover { text-decoration:underline; }
.aip-meta { font-size:11.5px; color:#9ca3af; margin-top:4px; }
.aip-edit { display:flex; flex-direction:column; gap:4px; max-width:520px; }
.aip-edit .aip-label { margin-top:8px; }
.aip-check { display:flex; flex-direction:column; align-items:flex-end; gap:5px; }
.aip-hint { font-size:11px; color:#9ca3af; max-width:240px; text-align:right; }
.aip-add { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:6px; }
.aip-add .aip-input:first-child { flex:1; min-width:220px; }
.aip-table-wrap { overflow-x:auto; margin-top:10px; border:1px solid #eef0f3; border-radius:14px; }
.aip-table { width:100%; border-collapse:collapse; }
.aip-table th { text-align:left; font-size:10.5px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:#9ca3af; padding:10px 14px; background:#fafafa; }
.aip-table td { padding:11px 14px; font-size:13px; border-top:1px solid #f3f4f6; vertical-align:top; }
.aip-url { color:#111827; font-weight:600; text-decoration:none; word-break:break-all; }
.aip-url:hover { text-decoration:underline; }
.aip-reason { font-size:11.5px; color:#b45309; margin-top:5px; line-height:1.45; max-width:340px; }
.aip-title-cell { color:#6b7280; max-width:240px; }
.aip-actions { text-align:right; width:44px; }
.aip-icon { border:none; background:transparent; color:#9ca3af; cursor:pointer; padding:6px; border-radius:8px; }
.aip-icon:hover { background:#fee2e2; color:#dc2626; }
.aip-summary { font-size:12px; color:#6b7280; margin-top:12px; }
.aip-progress { background:#f0f9ff; border:1px solid #bae6fd; border-radius:14px; padding:12px 14px; margin-bottom:14px; }
.aip-progress-top { display:flex; justify-content:space-between; font-size:12.5px; font-weight:700; color:#075985; margin-bottom:8px; }
.aip-bar { height:7px; border-radius:999px; background:#e0f2fe; overflow:hidden; }
.aip-bar div { height:100%; background:linear-gradient(90deg,#78d2f5,#4bbde8); border-radius:999px; transition:width .4s ease; }
.aip-step { display:flex; align-items:center; gap:7px; font-size:12px; color:#374151; margin-top:8px; }
.aip-step em { color:#6b7280; font-style:normal; }
.aip-dot { width:8px; height:8px; border-radius:50%; background:#cbd5e1; display:inline-block; margin:0 2px; }
.aip-link { display:inline-flex; align-items:center; gap:5px; border:none; background:none; font-family:inherit; font-size:12px; font-weight:700; color:#0369a1; cursor:pointer; padding:8px 0 0; }
.aip-link.danger { color:#dc2626; }
.aip-tabs { display:flex; gap:6px; flex-wrap:wrap; margin:0 0 14px; padding:5px; background:#f3f4f6; border-radius:999px; width:fit-content; max-width:100%; }
.aip-tab { border:0; background:transparent; padding:8px 16px; border-radius:999px; font-family:inherit; font-size:13px; font-weight:700; color:#6b7280; cursor:pointer; }
.aip-tab:hover { color:#111827; }
.aip-tab.on { background:#fff; color:#111827; box-shadow:0 1px 4px rgba(15,23,42,.12); }
.aip-gap { margin-top:14px; }
.aip-hint-inline { text-transform:none; letter-spacing:0; font-weight:500; color:#9ca3af; }
.aip-blocks { display:flex; flex-direction:column; gap:10px; }
.aip-block { border:1px solid #e5e7eb; border-radius:14px; padding:10px 12px 12px; background:#fcfcfd; }
.aip-block-heading { background:#f8fafc; border-left:4px solid #94a3b8; }
.aip-block-quote { border-left:4px solid #cbd5e1; }
.aip-block-bar { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:8px; }
.aip-block-tools { margin-left:auto; display:flex; gap:4px; }
.aip-select { height:34px; padding:0 10px; border:1.5px solid #e5e7eb; border-radius:10px; font-family:inherit; font-size:12.5px; font-weight:600; background:#fff; color:#111827; }
.aip-select.wide { width:100%; height:42px; font-size:13px; }
.aip-checkbox { display:inline-flex; flex-direction:row; align-items:center; gap:6px; font-size:12.5px; font-weight:600; color:#374151; cursor:pointer; }
.aip-checkbox input { width:auto; height:auto; margin:0; }
.aip-icon-btn { width:30px; height:30px; display:inline-flex; align-items:center; justify-content:center; border:1px solid #e5e7eb; background:#fff; border-radius:9px; color:#4b5563; cursor:pointer; }
.aip-icon-btn:hover:not(:disabled) { background:#f3f4f6; }
.aip-icon-btn.danger { color:#dc2626; border-color:#fecaca; }
.aip-icon-btn:disabled { opacity:.4; cursor:not-allowed; }
.aip-two { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
@media (max-width: 720px) { .aip-two { grid-template-columns:1fr; } }
.aip-sticky-actions { position:sticky; bottom:0; margin-top:16px; padding:12px 0 2px; background:linear-gradient(to top,#fff 70%,rgba(255,255,255,0)); align-items:center; }
.aip-agenda-edit { display:flex; flex-direction:column; gap:8px; align-items:flex-start; }
.aip-agenda-edit-row { display:grid; grid-template-columns:72px 1fr 1.4fr 30px; gap:8px; width:100%; align-items:center; }
@media (max-width: 720px) { .aip-agenda-edit-row { grid-template-columns:72px 1fr 30px; } .aip-agenda-edit-row input:nth-child(3) { grid-column:1 / -1; order:5; } }
.aip-chips { display:flex; flex-wrap:wrap; gap:8px; margin:0 0 12px; }
.aip-chip { border:1px solid #e5e7eb; background:#fff; border-radius:999px; padding:6px 13px; font-family:inherit; font-size:12.5px; font-weight:700; color:#374151; cursor:pointer; }
.aip-chip:hover:not(:disabled) { background:#f0f9ff; border-color:#7dd3fc; color:#075985; }
.aip-chip:disabled { opacity:.45; cursor:not-allowed; }
.aip-chat { display:flex; flex-direction:column; gap:10px; margin-top:8px; }
.aip-bubble { max-width:88%; padding:10px 13px; border-radius:16px; font-size:13px; line-height:1.5; color:#111827; }
.aip-bubble.you { margin-left:auto; background:#111827; color:#fff; border-bottom-right-radius:4px; }
.aip-bubble.you .aip-bubble-who { color:#cbd5e1; }
.aip-bubble.ai { background:#f3f4f6; border-bottom-left-radius:4px; margin-top:6px; }
.aip-bubble-who { display:flex; align-items:center; gap:6px; font-size:11px; font-weight:800; color:#6b7280; margin-bottom:4px; }
.aip-diff { display:flex; flex-direction:column; gap:8px; margin-top:6px; }
.aip-diff-row { position:relative; padding:10px 14px; border-radius:12px; font-size:13.5px; line-height:1.65; white-space:pre-wrap; border:1px solid #eef0f3; background:#fff; color:#374151; }
.aip-diff-row.added { background:#f0fdf4; border-color:#bbf7d0; color:#14532d; }
.aip-diff-row.removed { background:#fef2f2; border-color:#fecaca; color:#7f1d1d; text-decoration:line-through; text-decoration-color:rgba(220,38,38,.5); }
.aip-diff-row.changed { background:#fffbeb; border-color:#fde68a; }
.aip-diff-tag { font-size:10.5px; font-weight:800; letter-spacing:.05em; text-transform:uppercase; margin-bottom:3px; color:#6b7280; text-decoration:none; display:block; }
.aip-diff-row.added .aip-diff-tag { color:#15803d; }
.aip-diff-row.removed .aip-diff-tag { color:#b91c1c; }
.aip-diff-row.changed .aip-diff-tag { color:#b45309; }
.aip-ins { background:#bbf7d0; color:#14532d; text-decoration:none; border-radius:4px; padding:0 2px; }
.aip-stack { display:block; padding:4px 8px; margin:2px 0; border-radius:8px; }
.aip-del { background:#fecaca; color:#7f1d1d; text-decoration:line-through; border-radius:4px; padding:0 2px; }
.aip-invite-box { margin-top:14px; padding:14px; border:1px solid #bae6fd; background:#f0f9ff; border-radius:14px; }
.aip-review-action { padding:14px; border:1px solid #e5e7eb; background:#fafbfc; border-radius:14px; margin-bottom:6px; }
.aip-queue { border-color:#fde68a; background:#fffdf5; }
.aip-plan-tabs { margin-bottom:16px; }
.aip-plan-tabs .aip-tab { display:inline-flex; align-items:center; gap:7px; }
.aip-tab-dot { width:8px; height:8px; border-radius:50%; display:inline-block; }
.aip-tab-dot.green { background:#22c55e; } .aip-tab-dot.amber { background:#f59e0b; }
.aip-plan-card.wide { padding:22px; }
.aip-plan-fields { display:grid; grid-template-columns:1fr 1fr; gap:6px 26px; }
@media (max-width: 860px) { .aip-plan-fields { grid-template-columns:1fr; } }
.aip-length { display:grid; grid-template-columns:repeat(auto-fit,minmax(112px,1fr)); gap:8px; margin-bottom:6px; }
.aip-length-option { display:flex; flex-direction:column; align-items:flex-start; gap:2px; text-align:left; padding:9px 12px; border:1.5px solid #e5e7eb; border-radius:12px; background:#fff; cursor:pointer; font-family:inherit; }
.aip-length-option strong { font-size:13px; color:#111827; } .aip-length-option span { font-size:11.5px; color:#6b7280; }
.aip-length-option.on { border-color:#38bdf8; background:#f0f9ff; box-shadow:0 0 0 3px rgba(56,189,248,.18); }
.aip-length-option:disabled { opacity:.5; cursor:not-allowed; }
.aip-plan-doc { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-top:16px; padding:10px 14px; border:1px solid #eef0f3; border-radius:12px; background:#fff; }
.aip-refs { margin:0; padding-left:22px; display:flex; flex-direction:column; gap:6px; font-size:13px; }
.aip-email-grid { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:24px; align-items:start; }
@media (max-width: 960px) { .aip-email-grid { grid-template-columns:1fr; } }
.aip-email-frame { width:100%; height:640px; border:1px solid #e5e7eb; border-radius:14px; background:#f3f4f6; }
.aip-subsection { margin-top:22px; padding-top:18px; border-top:1px solid #eef0f3; }
.aip-h4 { display:flex; align-items:center; gap:8px; font-size:13.5px; font-weight:800; color:#111827; margin:0 0 4px; }
.aip-logo-preview { width:96px; height:96px; object-fit:contain; border-radius:12px; border:1px solid #e5e7eb; background:#fff; padding:8px; }
.aip-header-preview { width:100%; max-width:640px; aspect-ratio:3/2; object-fit:cover; border-radius:14px; border:1px solid #e5e7eb; background:#f3f4f6; display:block; }
.aip-logo-candidates { display:flex; flex-wrap:wrap; gap:12px; }
.aip-logo-candidate { display:flex; flex-direction:column; align-items:center; gap:6px; padding:10px; border:1.5px solid #e5e7eb; border-radius:12px; background:#fff; }
.aip-logo-candidate img { width:64px; height:64px; object-fit:contain; }
.aip-focus-target { scroll-margin-top: 90px; }
@keyframes aipGlowInfo { 0% { box-shadow:0 0 0 0 rgba(37,99,235,0); } 15% { box-shadow:0 0 0 4px rgba(37,99,235,.35), 0 0 36px rgba(37,99,235,.45); background-color:#eff6ff; } 70% { box-shadow:0 0 0 4px rgba(37,99,235,.2), 0 0 28px rgba(37,99,235,.28); background-color:#eff6ff; } 100% { box-shadow:0 0 0 0 rgba(37,99,235,0); } }
@keyframes aipGlowOk { 0% { box-shadow:0 0 0 0 rgba(22,163,74,0); } 15% { box-shadow:0 0 0 4px rgba(22,163,74,.35), 0 0 36px rgba(22,163,74,.45); background-color:#f0fdf4; } 70% { box-shadow:0 0 0 4px rgba(22,163,74,.2), 0 0 28px rgba(22,163,74,.28); background-color:#f0fdf4; } 100% { box-shadow:0 0 0 0 rgba(22,163,74,0); } }
@keyframes aipGlowError { 0% { box-shadow:0 0 0 0 rgba(220,38,38,0); } 15% { box-shadow:0 0 0 4px rgba(220,38,38,.35), 0 0 36px rgba(220,38,38,.45); background-color:#fef2f2; } 70% { box-shadow:0 0 0 4px rgba(220,38,38,.2), 0 0 28px rgba(220,38,38,.28); background-color:#fef2f2; } 100% { box-shadow:0 0 0 0 rgba(220,38,38,0); } }
.aip-glow-info { animation: aipGlowInfo 2s ease-out; }
.aip-glow-ok { animation: aipGlowOk 2s ease-out; }
.aip-glow-error { animation: aipGlowError 2s ease-out; }
@media (prefers-reduced-motion: reduce) { .aip-glow-info, .aip-glow-ok, .aip-glow-error { animation-duration: .01s; } }
.aip-jobs { display:flex; flex-direction:column; gap:8px; }
.aip-job { display:flex; justify-content:space-between; align-items:center; gap:12px; padding:10px 12px; border:1px solid #eef0f3; border-radius:14px; background:#fafbfc; font-size:13px; }
.aip-head-right { display:flex; align-items:center; gap:10px; overflow:visible; padding-right:6px; }
.aip-lang { display:inline-flex; background:#f3f4f6; border-radius:999px; padding:3px; }
.aip-lang button { border:none; background:transparent; font-family:inherit; font-size:11px; font-weight:800; color:#6b7280; padding:6px 11px; border-radius:999px; cursor:pointer; }
.aip-lang button.on { background:#fff; color:#111; box-shadow:0 1px 4px rgba(0,0,0,.08); }
.aip-bell-wrap { position:relative; overflow:visible; z-index:30; }
.aip-bell { position:relative; width:40px; height:40px; border-radius:999px; border:1px solid #e5e7eb; background:#fff; display:flex; align-items:center; justify-content:center; cursor:pointer; color:#374151; }
.aip-bell:hover { background:#f5f5f5; }
.aip-badge { position:absolute; top:-6px; right:-6px; z-index:40; pointer-events:none; box-sizing:border-box; min-width:20px; height:20px; padding:0 5px; border:2px solid #fff; border-radius:999px; background:#dc2626; color:#fff; font-size:10px; font-weight:800; display:flex; align-items:center; justify-content:center; }
.aip-pop { position:absolute; right:0; top:48px; width:340px; max-width:calc(100vw - 32px); background:#fff; border:1px solid #e5e7eb; border-radius:16px; box-shadow:0 18px 48px rgba(15,23,42,.16); z-index:60; padding:12px; }
.aip-pop-head { display:flex; justify-content:space-between; align-items:center; font-size:13px; margin-bottom:8px; }
.aip-x { border:none; background:none; cursor:pointer; color:#9ca3af; }
.aip-pop-empty { color:#9ca3af; font-size:12.5px; padding:14px 4px; text-align:center; }
.aip-pop-list { max-height:320px; overflow-y:auto; display:flex; flex-direction:column; gap:4px; }
.aip-notice { display:flex; gap:10px; align-items:flex-start; text-align:left; width:100%; padding:9px 10px; border:none; border-radius:12px; background:transparent; font-family:inherit; font-size:12.5px; line-height:1.45; color:#374151; cursor:pointer; }
.aip-notice:hover { background:#f5f7fa; }
.aip-notice.unread { background:#f0f9ff; }
.aip-notice em { display:block; font-style:normal; font-size:11px; color:#9ca3af; margin-top:3px; }
.aip-overlay { position:fixed; inset:0; background:rgba(15,23,42,.45); z-index:100; display:flex; align-items:center; justify-content:center; padding:16px; }
.aip-dialog { max-height:calc(100dvh - 32px); overflow-y:auto; background:#fff; border-radius:18px; padding:22px; max-width:380px; width:100%; box-shadow:0 24px 64px rgba(0,0,0,.25); }
.aip-dialog p { font-size:14px; font-weight:600; color:#111827; margin:0 0 14px; line-height:1.5; }
.aip-banner { display:flex; align-items:center; gap:8px; padding:10px 12px; border-radius:12px; font-size:12.5px; font-weight:600; margin-bottom:12px; }
.aip-banner.warn { background:#fef3c7; color:#92400e; }
.aip-ready-top { display:flex; align-items:center; gap:18px; flex-wrap:wrap; margin-bottom:16px; }
.aip-ring { position:relative; width:86px; height:86px; flex-shrink:0; }
.aip-ring-num { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:19px; font-weight:800; letter-spacing:-.03em; }
.aip-ready-label { font-size:11px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:#9ca3af; }
.aip-ready-verdict { font-size:15px; font-weight:800; color:#0d1117; margin:2px 0 4px; }
.aip-cats { display:grid; grid-template-columns:repeat(auto-fill,minmax(min(100%,250px),1fr)); gap:6px; margin-bottom:14px; }
.aip-cat { display:flex; align-items:center; gap:8px; padding:8px 10px; border-radius:12px; background:#fafbfc; border:1px solid #eef0f3; font-size:12.5px; color:#4b5563; }
.aip-cat.ok svg { color:#059669; } .aip-cat.partial svg { color:#d97706; } .aip-cat.missing svg { color:#cbd5e1; }
.aip-cat-name { flex:1; font-weight:600; color:#1f2937; }
.aip-cat-count { font-size:11px; font-weight:800; color:#6b7280; }
.aip-recs { margin-bottom:14px; }
.aip-rec { display:flex; gap:8px; align-items:flex-start; font-size:12.5px; color:#92400e; background:#fffbeb; border:1px solid #fde68a; border-radius:12px; padding:8px 10px; margin-top:6px; line-height:1.45; }
.aip-rec svg { flex-shrink:0; margin-top:2px; }
.aip-gate-row { display:grid; grid-template-columns:repeat(auto-fill,minmax(min(100%,180px),1fr)); gap:8px; margin-top:6px; }
.aip-gate { display:flex; flex-direction:column; gap:3px; padding:10px 12px; border-radius:14px; border:1px solid #e5e7eb; background:#fff; font-size:12.5px; }
.aip-gate.ready { border-color:#bbf7d0; background:#f0fdf4; } .aip-gate.warn { border-color:#fde68a; background:#fffbeb; } .aip-gate.blocked { border-color:#fecaca; background:#fef2f2; }
.aip-gate-state { display:inline-flex; align-items:center; gap:5px; font-weight:700; font-size:11.5px; }
.aip-gate.ready .aip-gate-state { color:#166534; } .aip-gate.warn .aip-gate-state { color:#92400e; } .aip-gate.blocked .aip-gate-state { color:#991b1b; }
.aip-gate small { color:#6b7280; font-size:11px; line-height:1.35; }
.aip-soon { font-style:normal; font-size:10px; font-weight:800; color:#075985; background:#e0f2fe; border-radius:999px; padding:2px 7px; width:fit-content; }
.aip-profile { display:flex; flex-direction:column; gap:14px; }
.aip-profile-text { font-size:13.5px; line-height:1.65; color:#374151; margin:0; }
.aip-products { display:grid; grid-template-columns:repeat(auto-fill,minmax(min(100%,240px),1fr)); gap:8px; }
.aip-product { display:flex; flex-direction:column; gap:3px; padding:10px 12px; border:1px solid #eef0f3; border-radius:14px; background:#fafbfc; font-size:12.5px; }
.aip-product strong { color:#0d1117; font-size:13px; } .aip-product-sum { color:#6b7280; line-height:1.45; }
.aip-chips { display:flex; flex-wrap:wrap; gap:6px; }
.aip-chip { display:inline-flex; align-items:center; padding:5px 11px; border-radius:999px; background:#f0f9ff; border:1px solid #bae6fd; color:#075985; font-size:12px; font-weight:600; }
.aip-chip.sm { padding:2px 8px; font-size:10.5px; background:#f3f4f6; border-color:#e5e7eb; color:#4b5563; }
.aip-contact { display:flex; flex-wrap:wrap; gap:14px; font-size:13px; color:#374151; }
.aip-contact > span { display:inline-flex; align-items:center; gap:6px; }
.aip-hits { display:flex; flex-direction:column; gap:10px; margin-top:12px; }
.aip-hit { border:1px solid #eef0f3; border-radius:14px; background:#fafbfc; padding:12px 14px; }
.aip-hit-top { display:flex; justify-content:space-between; align-items:flex-start; gap:10px; }
.aip-hit-url { font-size:11px; color:#9ca3af; margin:2px 0 6px; }
.aip-hit-text { font-size:12.5px; line-height:1.6; color:#374151; margin:0; white-space:pre-line; }
.aip-link:disabled { opacity:.45; cursor:not-allowed; }
.aip-engine { display:flex; flex-direction:column; align-items:flex-end; gap:5px; }
.aip-ok-text { color:#059669; font-size:12.5px; font-weight:700; display:flex; align-items:center; gap:6px; margin-bottom:10px; }
.aip-plan-bar { display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:14px; }
.aip-plan-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr)); gap:14px; align-items:start; }
.aip-plan-card { border:1px solid #e8eaee; border-radius:18px; background:#fafbfc; padding:16px; }
.aip-plan-card.removed { opacity:.65; background:#f3f4f6; }
.aip-plan-card.soon { background:#f8fafc; border-style:dashed; }
.aip-plan-head { display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:12px; }
.aip-plan-type { display:inline-flex; align-items:center; gap:7px; font-size:13px; font-weight:800; color:#0d1117; }
.aip-plan-card .aip-label { margin-top:10px; }
.aip-area { height:auto; padding:10px 14px; resize:vertical; line-height:1.5; }
.aip-wish { display:flex; flex-direction:column; gap:8px; margin-top:12px; padding:12px; border-radius:14px; background:#f0f9ff; border:1px solid #bae6fd; }
.aip-wish .aip-btn { align-self:flex-start; }
.aip-images { display:grid; grid-template-columns:repeat(auto-fill,minmax(min(100%,260px),1fr)); gap:14px; }
.aip-image { margin:0; border:1px solid #e5e7eb; border-radius:14px; overflow:hidden; background:#fff; }
.aip-image.cover { border-color:#86efac; box-shadow:0 0 0 2px #dcfce7; }
.aip-image img { display:block; width:100%; aspect-ratio:3/2; object-fit:cover; background:#f3f4f6; }
.aip-image figcaption { padding:10px 12px 12px; }
.aip-doc-top { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; flex-wrap:wrap; }
.aip-doc-title { font-size:24px; font-weight:800; letter-spacing:-.035em; line-height:1.2; color:#0d1117; margin:0 0 6px; }
.aip-doc-sub { font-size:15px; color:#4b5563; margin:0 0 8px; line-height:1.5; }
.aip-doc-section { margin:0 0 18px; }
.aip-doc-excerpt { font-size:14px; color:#374151; line-height:1.65; margin:4px 0 0; }
.aip-doc-body { max-width:760px; font-size:14.5px; line-height:1.75; color:#1f2937; }
.aip-doc-body h4 { font-size:18px; font-weight:800; letter-spacing:-.02em; margin:26px 0 8px; color:#0d1117; }
.aip-doc-body h5 { font-size:15px; font-weight:800; margin:18px 0 6px; color:#111827; }
.aip-doc-body p { font-size:14.5px; line-height:1.75; color:#1f2937; margin:0 0 12px; }
.aip-doc-body ul, .aip-doc-body ol { margin:0 0 14px; padding-left:22px; }
.aip-doc-body li { margin:0 0 5px; }
.aip-doc-body blockquote { margin:0 0 14px; padding:8px 16px; border-left:3px solid #78d2f5; background:#f0f9ff; color:#374151; }
.aip-doc-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr)); gap:18px; margin-top:22px; padding-top:18px; border-top:1px solid #eef0f3; }
.aip-doc-grid .wide { grid-column:1 / -1; }
.aip-doc-list { margin:4px 0 0; padding-left:20px; font-size:13.5px; line-height:1.65; color:#374151; }
.aip-agenda { display:flex; flex-direction:column; gap:8px; margin-top:6px; }
.aip-agenda-row { display:flex; gap:12px; align-items:flex-start; padding:10px 12px; border:1px solid #eef0f3; border-radius:14px; background:#fafbfc; font-size:13px; }
.aip-seo { font-size:15px; color:#1a0dab; margin-top:4px; }
.aip-seo-desc { font-size:13px; color:#4b5563; margin-top:2px; line-height:1.5; }
.aip-sources { display:flex; flex-direction:column; gap:6px; }
.aip-source { display:flex; align-items:center; gap:10px; padding:8px 10px; border-radius:12px; background:#fafbfc; border:1px solid #eef0f3; font-size:12.5px; }
.aip-source.used { background:#f0fdf4; border-color:#bbf7d0; }
.aip-btn.danger-text { color:#dc2626; border-color:#fecaca; }
.aip-btn.danger-text:hover:not(:disabled) { background:#fef2f2; }
.aip-spin { animation:aip-spin 1s linear infinite; }
@keyframes aip-spin { to { transform:rotate(360deg); } }
@media (max-width: 760px) {
  .aip-root, .aip-root * { min-width:0; }
  .aip-root { overflow-wrap:anywhere; }
  .aip-card { padding:16px; }
  .aip-head, .aip-row, .aip-job, .aip-progress-top, .aip-plan-head, .aip-hit-top { flex-wrap:wrap; }
  .aip-provider-main { min-width:0; flex-basis:100%; }
  .aip-add .aip-input:first-child { min-width:0; flex-basis:100%; }
  .aip-tabs { display:flex; flex-wrap:wrap; border-radius:16px; }
  .aip-btn { max-width:100%; white-space:normal; height:auto; min-height:38px; padding-top:8px; padding-bottom:8px; }
  .aip-input { min-width:0; max-width:100%; }
  .aip-create-grid { grid-template-columns:1fr; }
  .aip-create-btn { width:100%; }
  .aip-check { align-items:flex-start; }
  .aip-hint { text-align:left; }
  .aip-table .hide-mob { display:none; }
  .aip-item { flex-wrap:wrap; }
  .aip-item-side { justify-content:flex-start; }
}
`;
