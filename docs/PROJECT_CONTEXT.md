# PR Review feature — full project state

> **Purpose of this file**: drop this into a fresh Claude (or any AI
> assistant) conversation and they have everything they need to pick up
> where I left off. Read top to bottom; the TL;DR is enough for short
> tasks, the rest is for non-trivial work.

---

## TL;DR

- **Project**: VS Code extension `vscode-mermaid-chart`, building a
  **PR Review** feature on top of an existing GitHub App ("Mermaid Sync")
  that auto-regenerates `.mmd` diagrams when code changes.
- **Strategic frame**: PR Review is the *retention* slice — it makes the
  plugin essential once a user has bot-edited diagrams. Direct revenue
  comes from the GitHub App and per-seat extras; **the plugin is the
  demo that wins the org sale, not where money comes from**.
- **Status**: Q2 Slices 0–2 are shipped end-to-end and tested in an
  Extension Development Host with a real Git fixture. Slices 3–7 are
  deferred to Q3/Q4.
- **What I am**: a designer learning the engineering side. I prefer
  designer/PM-friendly explanations, decisions surfaced as A/B/C
  pickers, and small focused changes over big rewrites.
- **AI working style I expect**:
  - Apply taste-review feedback. When `/taste-reviewer` runs, **act
    only on must-fix items** — skip the nice-to-haves unless I ask.
  - Don't fabricate URLs, links, or strings the bot doesn't actually ship.
  - Bump a build marker (`build May4 vN`) at the top of the activate
    block when you change behavior so I can verify the bundle reloaded.

---

## Repo + environment

- **Source repo**: `/Users/rubenmangorrinha/vscode-mermaid-chart`
- **Test fixture repo (separate)**: `~/Desktop/Mermaidplugin-design`
  — has a real Git history with at least one bot-trailered commit
  (currently `b242285` by author "Mermaid Sync Bot"). Used to test the
  feature against a live Git repo.
- **Bundle**: `out/extension.js` (esbuild, ~4.4 MB minified). Compile
  with `npm run compile`. Webpack also builds Svelte webview assets.
- **Run the extension**: in the source repo's main VS Code window,
  press the green ▶ in the debug toolbar ("Run Extension") — opens an
  Extension Development Host window where the dev build of the
  extension is loaded. Open `~/Desktop/Mermaidplugin-design` as the
  workspace inside that host.
- **Console for diagnostics**: in the dev host, `Help → Toggle
  Developer Tools → Console`. Filter for `PR Review` or `BotEditDetector`.
- **Current build marker**: `build May4 v7 — taste-pass`.

### Critical reload note

`Cmd+R` does *not* always reload the extension bundle reliably. To force
a clean load: in the **main** window, click ⏹ (stop), wait 2 seconds,
then ▶ (start) — this spins up a fresh extension host with the latest
`out/extension.js`.

---

## What's built (Slices 0–2)

### Slice 0 — Detection

`src/commercial/prReview/`:
- `botEditDetector.ts` — `BotEditDetector` interface and `BotEditInfo`
  type.
- `gitTrailerDetector.ts` — concrete impl. Walks the active editor's
  file up to a `.git` dir, opens the repo via the VS Code Git extension
  API, reads the latest commit, parses the trailers (see contract
  below).
- Unit tested: `src/test/suite/botEditDetector.test.ts`.

### Slice 1 — Passive surfaces

- `botEditCodeLensProvider.ts` — CodeLens at line 0 of bot-edited
  `.mmd` files. Renders 4 entries: `⟳ Synced by Mermaid Sync · <sha>
  — Review`, `Accept`, `Reject`, `Edit`. All on the same line.
- `botEditFileDecorationProvider.ts` — purple `•` badge on the file
  in the explorer / on the tab. Color: `vscode.ThemeColor("charts.purple")`.
- `package.json` `editor/title` contributions — same Accept / Reject /
  Edit as icons in the editor's top-right toolbar, gated on a context
  key `mermaidChart.prReview.hasBotEdit`. Context key is set in
  `extension.ts` on active-editor-change and on detector-change.

### Slice 2 — Active review surface

- `reviewSurfaceWebview.ts` — custom webview rendering:
  1. **Banner** with `⟳ Synced by Mermaid Sync · <sha>`, timestamp,
     author, filename. Shows reason / PR link if the bot included those
     trailers.
  2. **Logged-in extras** row — three pills if signed in, one CTA row
     if signed out. Same vertical real estate.
  3. **Source diff card** — custom render via `lineDiff.ts` (LCS
     line diff), two line-number gutters, +/− markers, theme-aware
     insert/remove backgrounds.
  4. **Footer** — *flat-weighted* buttons `Edit · Reject · Accept`.
     No green-primary. (Decision: see "Taste decisions" below.)
- `lineDiff.ts` — small LCS-based line differ. Sufficient for diagrams
  up to a few hundred lines; do not reach for it on megabyte inputs.
- `botEditContentProvider.ts` — `TextDocumentContentProvider` for
  `mermaid-bot-edit://` URIs. Returns the parent commit's blob text
  for the diff.
- `openReview.ts` — orchestrator. Detects bot edit, reads old + new
  content, computes node diff, opens the surface webview in column 1
  and a single Mermaid preview in column 2 (split 55/45). Wires
  Accept/Reject/Edit messages to commands of the same name.
- `reviewActions.ts` — `acceptReview`, `rejectReview`, `editReview`
  implementations. `acceptReview` writes a `workspaceState`
  "reviewed" entry. `rejectReview` writes the parent-commit blob back
  to the working tree (user still has to commit). `editReview` opens
  the file for editing.
- `diagramNodeDiff.ts` — extracts node IDs from Mermaid source,
  computes added/removed sets. Strips frontmatter, comments, label
  content (incl. pipe-delimited edge labels).
- `previewTemplate.ts` (modified) — added a `<script>` block that
  watches the rendered SVG via `MutationObserver` and applies a
  `mermaid-pr-review-added` class to nodes whose Mermaid id matches
  any added id. CSS uses `--vscode-diffEditor-insertedLineBackground`
  for fill and `--vscode-gitDecoration-addedResourceForeground` for
  stroke. Auto-zooms once via `scrollIntoView({block: 'center',
  inline: 'center'})` so the user lands on the new node.
- `diagramDiffView.ts` (modified) — exports a new `openSingleDiagramPreview`
  that opens **one** preview pane (not two stacked); used by Slice 2.
  The original two-stacked `openDiagramDiffWebviews` is preserved for
  the existing sync flow.

### Activation wiring

Top of `extension.ts` `activate(context)`:
```ts
console.log("[PR Review] === activating PR review feature (build May4 v7 — taste-pass) ===");
try {
  // detector + providers + commands + context-key wiring
} catch (err) {
  console.error("[PR Review] FAILED to register providers:", err);
}
```
This block is **first** in `activate` — before any `await`, before the
mcAPI initialization that can hang. Wrapped in try/catch so failures
elsewhere can't kill it. **Do not move it later in `activate` without
a strong reason** — that's how I broke the feature for several hours.

---

## The bot ↔ extension contract

The two systems are loosely coupled through **Git commit-message
trailers**. There is no API call between them.

**Required** (gates detection):
- `Mermaid-Sync: regenerated` — without this trailer the extension
  treats the commit as human-authored and ignores it.

**Optional** (used by the banner when present):
- `Mermaid-Sync-Source: <ref>` — e.g. `pr-1`, `feat/payments`.
  Stored as `info.sourceRef`.
- `Mermaid-Sync-PR: <ref>` — e.g. `#482` or `482`. Stored as `info.prRef`.
- `Mermaid-Sync-PR-Title: <plain text>` — the PR title for the link.
- `Mermaid-Sync-Reason: <one line>` — human-readable description of
  *why* the bot regenerated; rendered as the banner subtitle.

The extension never invents these. If the bot doesn't write them,
they're absent from the UI — no fabricated URLs, no synthesised PR
numbers.

The trailer key for the required marker is configurable:
- Setting `mermaidChart.prReview.commitTrailer` (default
  `Mermaid-Sync: regenerated`).
- Setting `mermaidChart.prReview.enabled` (default `true`).

---

## Canonical UI copy (do NOT change without taste review)

| Where | Phrase |
|---|---|
| CodeLens banner title | `⟳ Synced by Mermaid Sync · <sha> — Review` |
| CodeLens accept | `$(check) Accept` |
| CodeLens reject | `$(discard) Reject` |
| CodeLens edit | `$(edit) Edit` |
| File decoration tooltip | `Synced by Mermaid Sync · <sha>` |
| Diff editor / webview title | `<filename> · Synced by Mermaid Sync` |
| Banner in surface webview | `⟳ Synced by Mermaid Sync` |
| Footer hint | `Review the change before merging.` |
| Footer buttons | `Edit` `Reject` `Accept` (flat, equal weight) |

Forbidden phrases (taste-rejected): `AUTO-REGENERATED`, `auto-regenerated`,
"This diagram was regenerated…" with sparkle icons, anything that names
the *act* over the *agent*.

---

## Taste decisions on the record

These are decisions the `/taste-reviewer` subagent issued and I applied.
Don't override them without re-running taste review.

1. **Canonical phrase**: "Synced by Mermaid Sync · `<sha>`" everywhere.
   Names the agent, no AI-flavored "auto-regenerated" filler.
2. **Highlight color** in the visual preview: theme-aware git-added
   green (`gitDecoration.addedResourceForeground` for stroke,
   `diffEditor.insertedLineBackground` for fill). NOT orange.
3. **Tab badge**: `vscode.ThemeColor("charts.purple")`, not a hardcoded
   hex. Tracks light/dark mode automatically.
4. **Footer buttons in the surface webview**: **flat, equal weight**.
   No green-filled "Accept change" primary. Reasoning: in a review
   surface, button hierarchy is a values statement; a saturated
   success-colored primary biases the user toward not actually
   reviewing.
5. **Highlight animation**: single 240ms fade-in. Not a 2-pulse loop.
6. **Logged-in extras pills**: no emoji glyphs (📚 💬 🛡 read as
   "AI demo trio"). Plain labels with native VS Code styling.
7. **Comments badge**: no visible "0" — vanity-metric framing makes
   the surface look unused.
8. **1-pager**: keep monetization framing, but **cut the SKU pricing
   table** — it's off-genre for a designer/PM doc.

---

## Decisions still open (need user input)

These are in `docs/pr-review-followups.md` for the team. Quick reference
copy here — pick A/B/C for each:

### 1. Slice 2.5 — prominent Accept button view

The mockup shows a green-filled `Accept change` primary, which directly
contradicts taste-decision #4 above.

- **A. Status quo (flat).** Already shipped. Most honest.
- **B. Tinted-but-not-filled.** `Accept` text/icon green + bold;
  `Reject` text/icon red. Hierarchy via *typography*, not fill. ~30 min
  CSS in `reviewSurfaceWebview.ts`. **Recommended.**
- **C. Match the mockup exactly** with green-filled `Accept`. Brings
  back the bias the taste reviewer flagged. Defensible if you decide
  review tools shouldn't *also* be neutral.

### 2. Push edits back to Git from the IDE

- **Now**: standard Git after `Edit` is the user's job (works).
- **Prototype-quality polish** (small): a "Commit edits" affordance
  that auto-stages, auto-commits with a `Mermaid-Sync-Reviewed-By:`
  trailer, optionally auto-pushes.
- **Slice 5 (proper)**: 3-state edit mode with a persistent banner
  and a single "Save & commit" button — your roadmap's existing slice.

### 3. Demoing the loop without "trust me, I edited locally"

- **A. Push fixture repo to GitHub, fake the bot commit by hand.** ~10 min.
  Demos the IDE half end-to-end; the bot half is theatrical.
- **B. GitHub Actions "fake bot" workflow.** ~1 hour to write. PR
  comment `/regen` triggers a workflow that pushes a regen commit with
  the trailer. Demos the full bot↔git↔IDE loop without needing the real
  GitHub App. **Recommended for an internal team demo.**
- **C. Real Mermaid Sync GitHub App on a sandbox repo.** Coordination
  with the GitHub App team. Required for customer demos.

---

## Monetization model (current thinking)

In one sentence: **the plugin and the review experience are free
forever; the GitHub App carries the org-level paywall, and the
logged-in extras in the review surface make the value of an account
visible at the moment of review.**

Three layers:
- **GitHub App** (server-side bot) — public-repo free tier; private
  repos, custom rules, audit retention paid. Org / team purchase via
  GitHub Marketplace. **Where most revenue lives.**
- **VS Code plugin** — banner + diff + Edit/Accept/Reject free.
  Library badge, comments, audit log line, version history are
  per-seat Mermaid Chart subscription benefits surfaced inline in the
  review surface (not gated — visible carrot in both states).
- **Slice 7 (Q4)** — pre-emptive local sync, calls inference, per-seat
  add-on metered by regenerations.

We **deliberately do not gate the review actions themselves**. Putting
a paywall at the moment of value generates support tickets, not
signups.

Strategic frame: **PR Review is the demo that wins the org sale, not
where money comes from.**

### What's visible in the demo today (May 2026)

All five paid surfaces are now rendered in-product as **locked, clickable
upsell affordances** — none are functional, but each is named, tier-tagged,
and surfaces a feature-specific modal on click:

| Surface | Where | State today |
|---|---|---|
| Engineering Docs library | Pill in `section.extras` of review webview | Active when signed in; locked-signin otherwise |
| Comments | Pill in `section.extras` | Locked, `TEAM` badge, upsell modal pushes trial |
| Logged review history | Pill in `section.extras` | Locked, `TEAM` badge, upsell modal pushes trial |
| AI edit | Pill in `section.extras` | Locked, `PRO` badge, upsell modal pushes waitlist |
| Multi-diagram review | "Mermaid Sync" activity-bar tree view (`Pending review`) | Two `PRO`-locked rows: *Multi-diagram review* + *Bulk accept* |

Click on any locked affordance → `vscode.window.showInformationMessage`
with feature-specific copy and `[Sign in | Start trial | Join waitlist]` /
`[Learn more]` / `[Not now]` buttons. Every click sends a
`VS_CODE_PLUGIN_PR_REVIEW_UPSELL_<FEATURE>` analytics event so the surface
doubles as funnel instrumentation when shipped.

Code lives in:
- `src/commercial/prReview/proFeatureUpsell.ts` — copy + modal.
- `src/commercial/prReview/pendingReviewTreeProvider.ts` — sidebar.
- `src/commercial/prReview/reviewSurfaceWebview.ts` — `renderExtrasBlock`.

Full version in `docs/pr-review-1-pager.md`.

---

## File map

```
src/
├─ commercial/
│  ├─ prReview/
│  │  ├─ botEditDetector.ts         # interface + types
│  │  ├─ gitTrailerDetector.ts      # impl, parses trailers, walks repo
│  │  ├─ botEditCodeLensProvider.ts # line-0 banner + 4 buttons
│  │  ├─ botEditFileDecorationProvider.ts # tab/explorer dot
│  │  ├─ botEditContentProvider.ts  # mermaid-bot-edit:// blob fetcher
│  │  ├─ diagramNodeDiff.ts         # added/removed node ids
│  │  ├─ lineDiff.ts                # LCS line diff for source-diff card
│  │  ├─ reviewSurfaceWebview.ts    # the rich review webview
│  │  ├─ reviewActions.ts           # accept/reject/edit logic
│  │  └─ openReview.ts              # orchestrator + command registration
│  └─ sync/
│     └─ diagramDiffView.ts          # adds openSingleDiagramPreview
├─ templates/
│  └─ previewTemplate.ts             # adds highlight + auto-zoom script
├─ types/
│  └─ git.d.ts                       # vendored VS Code Git ext API types
└─ test/suite/
   ├─ botEditDetector.test.ts
   └─ diagramNodeDiff.test.ts

docs/
├─ pr-review-1-pager.md              # designer/PM-friendly summary
├─ pr-review-followups.md            # open decisions for the team
└─ PROJECT_CONTEXT.md                # this file

.cursor/plans/
└─ pr_review_q2_slices_9f97ff0a.plan.md  # the original engineering plan
```

---

## How to test the feature

1. In the source repo, recompile if you changed code: `npm run compile`.
2. In the source repo's VS Code window, click ⏹ then ▶ in the debug
   toolbar to launch a fresh Extension Development Host.
3. In the dev host: `File → Open Folder…` →
   `~/Desktop/Mermaidplugin-design` (the test fixture).
4. If VS Code prompts "open Git repositories in parent folders?", click
   **Yes** — otherwise the detector can't find the repo.
5. Click `pr-review-architecture.mmd` in the explorer.
6. Verify:
   - Above line 1: `⟳ Synced by Mermaid Sync · b242285 — Review · ✓ Accept · ⊘ Reject · ✎ Edit` CodeLens row.
   - Tab title: `pr-review-architecture.mmd •` (purple dot).
   - Editor title bar (top right): three icon buttons.
7. Click the `Review` CodeLens. Verify:
   - Left column (55%): the rich surface webview with banner +
     extras row + diff + flat footer.
   - Right column (45%): the Mermaid preview, auto-zoomed to the
     `AuditLog` node, which is outlined in theme-aware green.
8. Click any of the three footer buttons or any toolbar/CodeLens
   button — they should all run the same command.

### Diagnostic logging

If something doesn't work, open the dev host's DevTools console and
filter for `PR Review` or `BotEditDetector`. The activation log will
include the build marker so you can confirm the new bundle is loaded.

---

## Roadmap

| Slice | Status | Description |
|---|---|---|
| 0 — Foundation | ✅ Q2 | Bot signal contract (commit trailer) |
| 1 — Banner + tab dot | ✅ Q2 | Passive surface that says "something changed here" |
| 2 — Visual diff side-by-side | ✅ Q2 | Source diff + visual preview + accept/reject/edit |
| 2.5 — Prominent Accept (optional) | ⏸ pending decision | A/B/C in the followups doc |
| 3 — Multi-diagram PR sidebar | Q3 | Pending-review list when PR touches many `.mmd` files |
| 4 — Removals, renames, restructures | Q3 | Ghost nodes, rename diff, repositioning. Highest design-to-eng ratio. |
| 5 — Edit mode | Q3 | 3-state edit (original / draft / saved) |
| 6 — Config file UX | Q3 | Visualize `.mermaidignore`, `.smart-mermaid-updates.yml` |
| 7 — Pre-emptive local sync | Q4 | Run regen logic locally; needs Mermaid auth |

---

## How to keep working on this

- **Small focused changes.** I value working software at every step.
  Big rewrites without an obvious reason are a smell.
- **Always recompile + bump the build marker** when you change runtime
  behavior. Lots of false debugging hours come from stale bundles.
- **Use `/taste-reviewer`** before shipping new UI surfaces or copy
  changes. Apply must-fix items only unless I say otherwise.
- **Don't fabricate links, hashes, dates, or copy.** If the bot doesn't
  ship a trailer, the UI doesn't show that field. If a string isn't
  in the canonical-copy table above, get a taste call before adding it.
- **Designer-friendly explanations.** When I ask "how does X work?",
  give me a layered answer: one-line summary, then the model, then the
  code path. Show diagrams (Mermaid is fine — it's our product) when
  it'd save 20 lines of prose.
- **Surface decisions as A/B/C** with a recommendation. Don't make
  irreversible product decisions on my behalf.
