# Diagram diff demo

See **[../START.md](../START.md)** for the short version (F5 → click **Open demo**).

Command in the Extension Development Host: **Mermaid (Test): Open PR Review Demo (Now/Before)**.

## Build once (if F5 fails)

From repo root:

```bash
pnpm --filter ./webview build && pnpm compile
```

## What to expect (flowchart demo)

Large platform-style diagram (~30 nodes) so pan/zoom and the change list matter.

| Change | Highlight |
|--------|-----------|
| `Partner`, `RateLimit`, `Audit`, `Notify`, `Fraud`, `Warehouse`, `Tracing` | Green on **After** |
| `Cache`, `LegacyAPI` | Red on **Before** |
| `Auth`, `Gateway` labels | Amber on **both** |
| Many edge adds/removes | Green / red on respective panels |

Click a row in the change list under the banner to pan/zoom to that element.

## Files

| File | Purpose |
|------|---------|
| `before.mmd` / `after.mmd` | Flowchart demo (default command) |
| `sequence-before.mmd` / `sequence-after.mmd` | Sequence diagram highlighting |
| `class-before.mmd` / `class-after.mmd` | Unsupported type — panels open without SVG highlights |

## Rest of the manual checklist

After the flowchart demo works, run the same command twice more:

| Step | Quick pick option | What to verify |
|------|-------------------|----------------|
| 1 | **Flowchart (highlights)** | Two panels: **Before** (top) and **After** (bottom). Banner shows change counts. Green / amber / red on diagram. |
| 2 | **Sequence diagram (highlights)** | New message highlighted green on **After**; click `MFA challenge` (or similar) in the change list — view pans/zooms. |
| 3 | **Class diagram (no highlights)** | Both panels open; banner says highlighting is unavailable (no SVG colors). Change list may be empty. |

**Click-to-focus (flowchart):** On **After**, click **+ Audit log** or **+ Partner portal**. On **Before**, click **− Session cache** or **− Legacy REST adapter**. The diagram should pan toward that node.

**Layout tip:** The editor may also show a text diff on the left; the two diagram tabs stack on the right. Focus the **Before** / **After** preview tabs if you only see one diagram.

## Troubleshooting

- **No highlights:** Run `pnpm --filter ./webview build` again, then `pnpm compile`, then **Developer: Reload Window** in the Extension Development Host.
- **Old UI (no change list):** Webview bundle was not rebuilt — rebuild webview as above.
- **Command not found:** You are in the wrong window; run the command in the **Extension Development Host**, not the main VS Code window where you edit code.

## Manual command

You can also run **MermaidChart: Open Diagram Diff (Current vs Updated)** with any two diagram strings, or open these files and diff them via regenerate / remote sync flows.
