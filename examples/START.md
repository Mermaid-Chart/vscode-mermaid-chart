# PR Review demo — 2 steps

## 1. Press **F5**

In the left sidebar, open **Run and Debug** (play icon).

Choose: **▶ F5 — Start Mermaid (Test) + PR Review demo**

Then press **F5** (or the green Play button). This compiles the extension first.

Open the **repo root** (`vscode-mermaid-chart`) or this `examples/` folder — both work.

## 2. Use the **new window**

A second VS Code window opens (title includes **Extension Development Host**).

- Click **Open demo** on the popup, **or**
- `Cmd+Shift+P` → **Mermaid (Test): Open PR Review Demo (Now/Before)**

**If the demo does nothing:** disable the marketplace **Mermaid** extension in the *new* window (Extensions → Mermaid → Disable). The test build uses a different id (`Mermaid (Test)`) but a duplicate marketplace install can still cause issues.

You should see the diagram with **Now / Before** at the bottom.

---

**Important:** Run the demo in the **new** window, not the window where you pressed F5.

**If F5 fails:** open the parent folder `vscode-mermaid-chart` in Terminal and run:

```bash
pnpm compile
```

Then try F5 again.
