---
title: PR Review — design follow-ups
audience: Designers + eng (decision artifact)
last-updated: May 2026
---

# Decisions still on the table

This doc captures three threads the team needs to weigh in on:

1. **Slice 2.5** — the prominent-Accept webview header from the mockup
2. **Git push from inside the IDE** — what happens when a user edits the bot's draft
3. **Demoing the loop end-to-end** without relying on a single laptop's local repo

---

## 1. Slice 2.5 — the prominent-Accept view

### The tension

The mockup shows three buttons in the footer with explicit hierarchy:
`Edit` (outline) · `Reject` (red outline) · `Accept change` (green filled,
prominent). The current implementation flattens all three to equal
weight on **taste-reviewer guidance**: in a *review* surface, button
hierarchy is a values statement; a saturated success-colored primary
biases the user toward not actually reviewing.

If you want the mockup's prominence, you have to overrule that call
explicitly.

### Three viable paths

| Path | What ships | Cost | Honesty |
|---|---|---|---|
| **A. Status quo** | Keep flat buttons. Accept is the rightmost (last to scan), but no color hierarchy. | 0 — already shipped. | Most honest about the review intent. The mockup loses on this dimension. |
| **B. Tinted-but-not-filled** | `Accept` becomes outline + green text + bold; `Reject` becomes outline + red text. `Edit` stays neutral. Hierarchy via *typography and color*, not fill. | ~30 min CSS in `reviewSurfaceWebview.ts`. | Compromise. Reads as "primary actions are colored" without screaming "click the green one." |
| **C. Fill the mockup exactly** | `Accept change` is a green-filled button, `Reject` is red-outlined, `Edit` is plain outline. | ~30 min CSS. | Fastest to brand-match. Re-introduces the "click the green one" bias the taste reviewer flagged. Defensible if you decide review tools shouldn't *also* be neutral. |

There's no fourth option that's both (a) the easiest path and (b)
matches the mockup chrome exactly without a custom editor — that's
Slice 4+ territory.

### My recommendation

**Path B.** Splits the difference: Accept and Reject get visible weight,
but neither dominates. The user still has to *read* the labels to choose,
which is what we want in a review.

### What I need from you

- Pick A / B / C
- If C: are you OK with re-running taste review on the result so the
  team is on the record about overruling the bias warning?

---

## 2. Pushing edits back to Git from the IDE

### What works today (Slice 2)

The `Edit` button opens the bot's `.mmd` file in the regular text
editor. From there, **standard Git is the user's job**: edit → save →
`git add` → `git commit` → `git push`. Nothing custom from us, and the
bot's commit + the user's edits stack as two commits on the branch.

### What we could add (small, prototype-quality)

A "Commit edits" affordance in the review surface that:
1. Detects when the file is dirty *and* belongs to a bot commit branch
2. Stages + commits with a message like
   `Adjust diagram synced by Mermaid Sync · <sha>`
3. Adds a trailer:
   `Mermaid-Sync-Reviewed-By: <user>`
4. Optionally `git push` if the branch tracks a remote
5. Stamps `workspaceState` so the banner switches to a "Reviewed" mode

### What we could add (proper, Slice 5)

The "Edit mode" slice in your roadmap is exactly this UX done right —
the bot's draft becomes a 3-state document (original / draft / saved)
with a persistent banner and a single "Save & commit" button that wraps
the Git operations.

### What I need from you

- For the prototype right now, do you want the small "Commit edits"
  affordance (paths 1–4 above) wired up? Yes / No.
- If yes: should it `git push` automatically, or stop after the local
  commit so the user pushes when they want?

---

## 3. Demoing the loop without "trust me, I edited locally"

The current demo path requires the audience to take it on faith that
the commit trailer was written by a bot, not by you in your terminal.
For an internal demo it's fine. For an exec or customer demo it's not.

### Three demo formats, ordered by realism

| Format | Setup | What the audience sees | What it proves |
|---|---|---|---|
| **A. Push your fixture repo to GitHub, fake the bot commit by hand** | 10 min — `gh repo create`, push, branch, commit-with-trailer, push branch, open PR | Real GitHub PR with the trailer commit. Pull the branch in the dev host, banner appears. | The IDE half. The bot half is theatrical. |
| **B. GitHub Actions "fake bot" workflow** | ~1 hour — write a `.github/workflows/fake-bot.yml` that triggers on `/regen` PR comment and pushes a regeneration commit with the trailer | Type `/regen` in a GitHub PR comment. A new commit appears with the trailer. Pull, IDE shows banner. | The full bot↔git↔IDE loop, end to end. Doesn't need real Mermaid Sync App. |
| **C. Real Mermaid Sync GitHub App on a sandbox repo** | Depends on the GitHub App team — needs an installation token, sandbox org, permission to merge | The actual production bot. | Everything. This is the customer-facing demo. |

### My recommendation

**B for an internal team demo this quarter.** It's convincing without
needing anything from the GitHub App team. I can write the workflow
file in ~1 hour. The audience sees a real GitHub PR with a real bot
commit (the workflow becomes the bot for demo purposes).

**C for the customer demo** — but that's a coordination ask of the
GitHub App team, not a code task.

### What I need from you

- Pick A / B / C
- If B: what's the sandbox repo we'd put the workflow in? `Mermaidplugin-design`
  is fine if you're OK with the demo PRs being visible there.

---

## Quick answers to inline questions

**"Is it possible for the user to push to the same git, the updated
diagram, in case there is edits?"**

Yes — already works via standard Git after `Edit`. The polish is in
section 2 above.

**"Hook in the PR link from a follow-up trailer like
`Mermaid-Sync-PR: #482`?"**

Done. The detector now reads `Mermaid-Sync-PR:` and
`Mermaid-Sync-PR-Title:` (and `Mermaid-Sync-Reason:` for the description
sentence in the mockup). All three render in the banner when present.
The bot is the one that decides whether to ship them; the extension
just respects what the bot writes.
