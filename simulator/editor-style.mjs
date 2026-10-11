export const editorCSS=`
[data-vaiwl-owned="workspace-editor"]{width:min(620px,calc(100vw - 24px));max-width:620px;max-height:calc(100dvh - 40px);overflow:auto;border:1px solid var(--line,#e8e8e8);border-radius:20px;padding:24px;font:14px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:var(--ink,#202123);background:var(--surface,#fff);box-shadow:0 20px 80px #0003}
[data-vaiwl-owned="workspace-editor"]::backdrop{background:#0005}
[data-vaiwl-owned="workspace-editor"] *{box-sizing:border-box}
[data-vaiwl-owned="workspace-editor"] h2{font-size:20px;font-weight:600;letter-spacing:-.02em;margin:0 0 6px}
[data-vaiwl-owned="workspace-editor"] p{font-size:12px;color:var(--muted,#6e6e76);margin:6px 0 16px}
[data-vaiwl-owned="workspace-editor"] [role=status]:not(:empty){position:sticky;top:0;background:var(--bubble,#f4f4f4);border:1px solid var(--line,#e8e8e8);padding:12px;border-radius:10px;color:var(--ink,#202123);z-index:1}
[data-vaiwl-owned="workspace-editor"] .edit-section{border-top:1px solid var(--line,#e8e8e8);margin-top:20px;padding-top:18px}
[data-vaiwl-owned="workspace-editor"] h3,[data-vaiwl-owned="workspace-editor"] summary{font-size:14px;font-weight:550;margin:0 0 12px}
[data-vaiwl-owned="workspace-editor"] summary{cursor:pointer;min-height:32px}
[data-vaiwl-owned="workspace-editor"] label{display:flex;flex-direction:column;gap:6px;margin:12px 0;font-size:12px;color:var(--muted,#6e6e76)}
[data-vaiwl-owned="workspace-editor"] input,[data-vaiwl-owned="workspace-editor"] select{font:inherit;font-size:14px;color:var(--ink,#202123);background:var(--bubble,#f4f4f4);width:100%;min-height:40px;padding:8px 11px;border:1px solid var(--line,#e8e8e8);border-radius:9px;max-width:100%}
[data-vaiwl-owned="workspace-editor"] label:has(input[type=checkbox]){flex-direction:row;align-items:center;gap:10px}
[data-vaiwl-owned="workspace-editor"] input[type=checkbox]{width:18px;min-height:18px;order:-1;accent-color:var(--ink,#202123)}
[data-vaiwl-owned="workspace-editor"] button{font:inherit;color:inherit;background:var(--bubble,#f4f4f4);padding:8px 13px;margin:4px 5px 4px 0;border:1px solid var(--line,#e8e8e8);border-radius:9px;min-height:38px;cursor:pointer}
[data-vaiwl-owned="workspace-editor"] button:hover{background:var(--hover,#ececec)}
[data-vaiwl-owned="workspace-editor"] button.primary{background:var(--ink,#202123);color:var(--surface,#fff);border-color:var(--ink,#202123)}
[data-vaiwl-owned="workspace-editor"] button:disabled{opacity:.45}
[data-vaiwl-owned="workspace-editor"] input:focus-visible,[data-vaiwl-owned="workspace-editor"] select:focus-visible,[data-vaiwl-owned="workspace-editor"] button:focus-visible,[data-vaiwl-owned="workspace-editor"] summary:focus-visible{outline:2px solid #3877ba;outline-offset:2px}
[data-vaiwl-owned="workspace-editor"] br,[data-vaiwl-owned="workspace-editor"] hr{display:none}
[data-vaiwl-owned="workspace-editor"] .edit-footer{display:flex;justify-content:space-between;margin-top:20px;padding-top:16px;border-top:1px solid var(--line,#e8e8e8)}
@media(max-width:600px){[data-vaiwl-owned="workspace-editor"]{padding:20px;border-radius:16px}}
.icon-choices{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}.icon-choices button{display:grid;place-items:center;width:36px;height:36px;padding:6px}.icon-choices [aria-pressed=true]{background:var(--hover,#ececec)}
`;
