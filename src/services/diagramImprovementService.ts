import * as vscode from "vscode";
import {
  sendLanguageModelUserPrompt,
  isLanguageModelAvailable,
  getLanguageModelDisplayName,
  throwIfLanguageModelCancelled,
  type LanguageModelRequestOptions,
} from "./vscodeLanguageModel";

export interface GenerateImprovementOptions extends LanguageModelRequestOptions {
  modelId?: string;
  cancellationToken?: vscode.CancellationToken;
}

export type ImprovementKind = "layout" | "styling";

const MAX_IMPROVEMENT_CARDS = 2;

export interface DiagramImprovementCard {
  id: ImprovementKind;
  title: string;
  proposedCode: string;
}

const MERMAID_SEMANTIC_RULES = `Semantic preservation — MANDATORY for every variant:
- Detect diagram type from the first non-comment line (flowchart/graph, sequenceDiagram, classDiagram, erDiagram, stateDiagram/stateDiagram-v2, gantt, pie, mindmap, timeline, journey, C4Context, etc.) and keep that exact keyword.
- Do NOT convert one diagram type into another under any circumstance.
- Keep every entity, node, participant, class, state, task, and relationship/edge. Omitting any is forbidden unless fixing an obvious duplicate syntax error.
- Do NOT drop attributes, columns, messages, transitions, labels, stereotypes, or multiplicity annotations that carry meaning.
- Do NOT merge separate concepts into one node or split one concept into multiple nodes.
- Do NOT rewrite a multi-entity / hierarchical model as a single linear chain.

erDiagram (highest-risk — check every line):
- Preserve every relationship line exactly: cardinality markers (||--o{, }|--|{, |o--o|, etc.), identifying solid (--) vs non-identifying dashed (..) line style, and relationship label.
- You may add direction or blank-line spacing only. You may NOT change cardinality or relabel relationships.
- NEVER replace erDiagram syntax with flowchart/graph syntax.

flowchart / graph:
- Preserve every edge endpoint: A --> B must stay the same source and target nodes.
- You may add or rename subgraph wrappers around existing nodes; do NOT rewire edges.

sequenceDiagram:
- Preserve every participant/actor and every message in its original time order.
- Do NOT remove lifelines, reorder messages, or merge related messages.

classDiagram:
- Preserve all classes, members (with visibility and type), and associations.
- Do NOT remove stereotypes (<<interface>>, <<abstract>>, <<service>>, <<enum>>) or multiplicity.

stateDiagram / stateDiagram-v2:
- Preserve all states, transitions (including text on arrows), and composite state boundaries.
- Do NOT flatten composite states or remove concurrency (--) separators.`;

const MERMAID_SYNTAX_REFERENCE = `Mermaid features you MAY use (only what fits the diagram type and the variant):

─── FLOWCHART / GRAPH ───────────────────────────────────────────────────────
Direction (graph-level or per-subgraph): TB, TD, BT, RL, LR

Classic node shapes:
  [text] rectangle          (text) rounded edges     ((text)) circle
  {text} rhombus/diamond    [[text]] subroutine       [(text)] cylinder/DB
  >text] asymmetric         {{text}} hexagon          (((text))) double-circle
  [/text/] parallelogram    [\\text\\] para-alt
  [/text\\] trapezoid       [\\text/] trapezoid-alt

Semantic shapes (v11.3+) via @{ shape: alias } — preferred when role is clear:
  @{ shape: db }        database/storage cylinder
  @{ shape: diam }      decision diamond
  @{ shape: rounded }   event / rounded rect
  @{ shape: doc }       document
  @{ shape: stadium }   start/end terminal (pill)
  @{ shape: sm-circ }   small start circle
  @{ shape: fr-circ }   framed stop circle
  @{ shape: hex }       preparation / conditional hexagon
  @{ shape: lean-r }    data input/output (lean-right)

Subgraphs (structure + layout):
  subgraph id [Display Title]
    direction LR          %% per-subgraph direction — overrides parent only when no node links outside
    A --> B
  end

Edges:
  --> arrow    --- open    -.-> dotted arrow    ==> thick arrow
  --o circle   --x cross   <<->> bidirectional
  A e1@--> B   %% assign edge ID "e1" for targeted linkStyle/animation

Edge length (extra dashes span more ranks): A ---> B (2 ranks)  A ----> B (3 ranks)

linkStyle (zero-based index, comma list, or "default"):
  linkStyle 0 stroke:#b85450,stroke-width:2px
  linkStyle 1,2,7 color:blue
  linkStyle default stroke:#999,stroke-width:1px

Curve styles (diagram-level via frontmatter, reduces crossing):
  ---
  config:
    flowchart:
      curve: stepBefore
  ---
  Available: basis, bumpX, bumpY, cardinal, catmullRom, linear,
             monotoneX, monotoneY, natural, step, stepAfter, stepBefore

classDef + class for node roles:
  classDef db      fill:#dae8fc,stroke:#6c8ebf,stroke-width:2px
  classDef error   fill:#f8cecc,stroke:#b85450
  classDef success fill:#d5e8d4,stroke:#82b366
  classDef user    fill:#fff2cc,stroke:#d6b656
  classDef default fill:#f5f5f5,stroke:#999,stroke-width:1px   %% applied to all unclassed nodes
  class nodeA db                %% attach to one node
  class nodeA,nodeB db          %% attach to multiple nodes
  nodeA:::db                    %% inline shorthand (usable in edge declarations)
  style nodeA fill:#ffe,stroke:#843   %% single-node override

ELK layout — YAML frontmatter ONLY (not inline directive), for complex crossing-heavy diagrams:
  ---
  config:
    layout: elk
  ---
  flowchart TD
  ...

─── SEQUENCE DIAGRAM ────────────────────────────────────────────────────────
Participant types: participant (box) | actor (stick figure)
  participant A as "Display Name"
  actor U as User

Actor grouping in colored boxes:
  box Aqua Frontend
    participant A
  end
  box rgb(200,230,200) Backend Services
    participant B
    participant C
  end
  box transparent Aqua   %% "transparent" forces no fill when group name is a color

Message arrows:
  A->>B: sync request          A-->>B: response (dotted arrow)
  A->B: no arrowhead           A-->B: dotted no arrowhead
  A-xB: terminated             A-)B: async (open arrow)
  A->>+B: call (activate B)    B-->>-A: return (deactivate B)

Activations (highlight active lifeline):
  activate B / deactivate B    %% or use +/- suffix on arrow as shown above

Notes:
  note right of A: text
  note left of A: text
  note over A,B: shared note spanning two lifelines

Control flow blocks (add only when reflecting existing logic — never invent new paths):
  loop Every 5 seconds \n ... \n end
  alt Happy path \n ... \n else Error path \n ... \n end
  opt Optional step \n ... \n end
  par Action 1 \n ... \n and Action 2 \n ... \n end
  critical Must succeed \n ... \n option Timeout \n ... \n end
  break Exception occurred \n ... \n end

Background highlighting:
  rect rgb(255,240,200) \n ... \n end
  rect rgba(0,100,255,0.1) \n ... \n end

Sequence numbering:
  autonumber            %% start from 1
  autonumber 10 5       %% start at 10, increment by 5

─── CLASS DIAGRAM ───────────────────────────────────────────────────────────
Direction (place after classDiagram): direction TB | BT | LR | RL

Namespace grouping:
  namespace ServiceLayer {
    class UserService
    class OrderService
  }
  namespace ServiceLayer ["Service Layer"] {   %% with display label
    class UserService
  }
  namespace com.example.app {   %% dot-notation auto-creates parent namespaces
    class Leaf
  }

Member visibility: +public  -private  #protected  ~package
Modifiers (suffix on method): abstractMethod()* | staticMethod()$  staticField$
Generic types: List~String~  Map~String,Integer~
Stereotypes: <<interface>> <<abstract>> <<service>> <<enum>>
Lollipop interface: foo --() bar   (foo provides bar interface)

Relation types:
  <|-- inheritance    *-- composition    o-- aggregation
  --> association     ..|> realization   .. dashed link
  "1" --> "many"      %% cardinality labels

Notes: note "diagram-level note"    note for ClassName "class-level note"

Styling:
  classDef highlight fill:#fff2cc,stroke:#d6b656,stroke-width:2px
  cssClass "ClassName" highlight           %% attach by name (string-quoted)
  class Class1,Class2 highlight            %% attach to list
  ClassName:::highlight                    %% inline shorthand
  style ClassName fill:#dae8fc,stroke:#6c8ebf   %% single-class override

─── ER DIAGRAM ──────────────────────────────────────────────────────────────
Direction (immediately after erDiagram): direction TB | BT | LR | RL

Entity syntax:
  ENTITY_NAME["Display Alias"] {
    type  attributeName  PK
    type  attributeName  FK
    type  attributeName  UK
    type  attributeName  PK, FK       %% multiple keys on one attribute
    type  attributeName  "comment"    %% inline comment in double quotes
  }

Cardinality markers — preserve character-for-character:
  ||--||  exactly-one  to  exactly-one
  ||--o|  exactly-one  to  zero-or-one
  ||--o{  exactly-one  to  zero-or-more
  ||--|{  exactly-one  to  one-or-more
  }o--o{  zero-or-more to  zero-or-more
  }|--|{  one-or-more  to  one-or-more

Identifying (solid --) vs non-identifying (dashed ..):
  ENTITY1 ||--|| ENTITY2 : label    %% solid = child cannot exist without parent
  ENTITY1 ||..o{ ENTITY2 : label    %% dashed = independent existence

Styling entities (NEVER touch relationship lines):
  style ENTITY fill:#dae8fc,stroke:#6c8ebf
  classDef aggregate fill:#fff2cc,stroke:#d6b656
  class ENTITY1,ENTITY2 aggregate

─── STATE DIAGRAM ───────────────────────────────────────────────────────────
Use stateDiagram-v2 (v1 has limited classDef support).
Direction (place after stateDiagram-v2): direction LR | TB

Composite states (group semantically related states):
  state Processing {
    [*] --> Validating
    Validating --> Computing
    Computing --> [*]
  }

Concurrency within composite state (-- separator):
  state Running {
    [*] --> TaskA
    --
    [*] --> TaskB
  }

Choice (conditional branch):
  state checkResult <<choice>>
  Validated --> checkResult
  checkResult --> Success : if valid
  checkResult --> Failure : if invalid

Fork / Join:
  state fork_state <<fork>>
  state join_state <<join>>
  Processing --> fork_state
  fork_state --> BranchA
  fork_state --> BranchB
  BranchA --> join_state
  BranchB --> join_state

Notes: note right of StateName : description text

Styling:
  classDef errorState fill:#f8cecc,stroke:#b85450,color:#000
  class StateName errorState             %% class statement
  StateName:::errorState --> NextState   %% ::: inline on a transition line
  LIMITATION: classDef CANNOT be applied to [*] start/end states
              or to composite state container boundaries.

─── THEMING (CROSS-DIAGRAM) ─────────────────────────────────────────────────
Frontmatter config block (YAML, must be at the very top before diagram keyword):
  ---
  config:
    theme: base          %% "base" is the only theme that supports themeVariables
    themeVariables:
      primaryColor: "#dae8fc"
      primaryTextColor: "#000000"
      primaryBorderColor: "#6c8ebf"
      lineColor: "#555555"
      secondaryColor: "#fff2cc"
      tertiaryColor: "#d5e8d4"
      noteBkgColor: "#fff5ad"
      clusterBkg: "#f5f5f5"
  ---

Available named themes (no customization): default, neutral, dark, forest
Theming engine only recognizes hex colors (#rrggbb), not color names.
Derived variables auto-adjust (e.g. primaryBorderColor darkens from primaryColor).`;

const MERMAID_OUTPUT_RULES = `Output rules:
- Valid, complete Mermaid that parses without errors.
- No markdown fences (\`\`\`) inside JSON "code" values.
- No comments or explanation text outside the diagram definition.
- Prefer clear IDs and labels; keep existing IDs when they are already clear.
- Frontmatter config blocks (--- ... ---) must appear as the very first lines, before the diagram type keyword.
- In classDef definitions, commas inside CSS values must be escaped as \\, (e.g. stroke-dasharray:5\\,5).
- Theming engine recognizes only hex colors (#rrggbb or #rgb), not CSS color names like "red" or "blue".`;

const CARD_SPECS: Array<{
  id: ImprovementKind;
  fallbackTitle: string;
  variantRules: string;
}> = [
  {
    id: "layout",
    fallbackTitle: "Layout",
    variantRules: `layout variant — dramatic visual optimization; same nodes and edges only:
Goal: transform readability through grouping, semantic shapes, and layout engines. The output should look substantially reorganized compared to a flat list — but every original node ID and every edge endpoint must remain.

Flowchart (apply ALL applicable techniques — do not stop at direction-only changes):
- Wrap related nodes in named subgraph/end blocks with clear titles:
    subgraph auth [Authentication]
    subgraph projects [Project Management]
    subgraph ai [AI Engine]
  Nested subgraphs are allowed when domains nest logically.
- Each subgraph may declare direction LR or TB to reduce internal crossings.
- Replace generic [] shapes with semantic shapes that clarify role:
    [(text)] or @{shape:db}      → databases / data stores
    {text}   or @{shape:diam}    → decisions (keep existing diamond nodes as diamonds)
    @{shape:stadium} or ([text]) → start / end terminals
    (text)   or @{shape:rounded} → events / processes
    [/text/] or @{shape:lean-r}  → I/O, email, export operations
- For diagrams with 15+ nodes or back-edges, ALWAYS add ELK layout frontmatter:
    ---
    config:
      layout: elk
      flowchart:
        curve: stepBefore
    ---
- Switch graph direction (TD ↔ LR) when it reduces crossings alongside subgraphs.
- Use longer edge spans on back-edges and dense fan-outs: A ----> B or A ---> B.
- Improve edge label text where labels exist; do not invent new semantic labels.
- Reorder declarations to place related nodes near each other inside subgraphs.
- Do NOT add, remove, or rewire any edge. Do NOT add nodes.

Sequence:
- Group actors in box blocks with descriptive labels (box rgb(...) GroupName ... end).
- Add loop / alt / opt / par / critical / break blocks ONLY when they reflect existing message flow.
- Reorder participant declarations to reduce lifeline crossings.
- Add autonumber when there are more than 5 messages.
- Do NOT add, remove, or reorder any message line.

Class:
- Wrap related classes in namespace blocks (namespace Name ["Label"] { ... }).
- Change direction (direction LR ↔ TB) when it improves layout.
- Add note for ClassName "..." for key classes.
- Do NOT add classes, members, or associations.

ER:
- Add entity display aliases ENTITY["Human-Readable Name"].
- Group entity blocks by domain with blank lines between groups.
- Change direction line when it improves layout (direction TB ↔ LR).
- Do NOT change any relationship cardinality line.

State:
- Wrap related states in composite state blocks (state Name { ... }).
- Change direction when it improves layout.
- Add notes (note right of State : text) for important transitions.
- Do NOT flatten composite states or add new transitions.

FORBIDDEN: classDef, style, linkStyle, themeVariables, box/rect colors used purely for styling.`,
  },
  {
    id: "styling",
    fallbackTitle: "Styling",
    variantRules: `styling variant — full color and visual polish; topology identical to input:
Goal: apply comprehensive styling — node fills, strokes, edge colors, subgraph/cluster backgrounds, and diagram-wide theme. Keep the same flat structure as input (no new subgraphs, namespaces, or grouping).

Flowchart:
- Start with diagram-wide theme in frontmatter (theme: base required for customization):
    ---
    config:
      theme: base
      themeVariables:
        background: "#fafafa"
        primaryColor: "#dae8fc"
        primaryTextColor: "#1a1a1a"
        primaryBorderColor: "#6c8ebf"
        lineColor: "#666666"
        secondaryColor: "#fff2cc"
        tertiaryColor: "#d5e8d4"
        clusterBkg: "#f0f4f8"
        clusterBorder: "#b0b0b0"
        nodeBorder: "#888888"
        defaultLinkColor: "#888888"
    ---
- ALWAYS define classDef default FIRST so no node is left unstyled:
    classDef default fill:#f5f5f5,stroke:#999,stroke-width:1px,color:#333
- Define 5–10 role-specific classDef groups and assign EVERY node to exactly one:
    classDef auth     fill:#e8d5f5,stroke:#7b4fa6,stroke-width:2px,color:#333
    classDef project  fill:#dae8fc,stroke:#6c8ebf,stroke-width:2px,color:#333
    classDef ai       fill:#d5e8d4,stroke:#82b366,stroke-width:2px,color:#333
    classDef deploy   fill:#e1d5e7,stroke:#9673a6,stroke-width:2px,color:#333
    classDef monitor  fill:#fff2cc,stroke:#d6b656,stroke-width:2px,color:#333
    classDef notif    fill:#ffe6cc,stroke:#d79b00,stroke-width:2px,color:#333
    classDef config   fill:#eeeeee,stroke:#666666,stroke-width:2px,color:#333
    classDef error    fill:#f8cecc,stroke:#b85450,stroke-width:2px,color:#333
    classDef terminal fill:#d5e8d4,stroke:#82b366,stroke-width:3px,color:#333
    classDef decision fill:#fff2cc,stroke:#d6b656,stroke-width:2px,color:#333
  List every node in class statements — zero nodes may remain unassigned.
- Style edges: linkStyle default stroke:#999,stroke-width:1px
  Highlight critical/error paths: linkStyle N stroke:#b85450,stroke-width:2px (use edge index).
- Apply curve style: config.flowchart.curve: cardinal in frontmatter.
- Use style nodeId fill:#xxx,stroke:#xxx for one-off overrides when a node needs unique emphasis.

Sequence:
- Wrap actor groups in colored box blocks: box rgb(218,232,252) Frontend ... end
- Highlight message regions: rect rgb(255,240,200) ... end and rect rgba(0,100,200,0.08) ... end
- Do NOT add, remove, or reorder messages or participants.

Class:
- classDef per stereotype/role + cssClass "ClassName" styleName for every class.
- style ClassName fill:#xxx,stroke:#xxx for individual overrides.
- Do NOT add members, associations, or namespaces.

ER:
- style ENTITY and classDef + class for every entity — color all entities by role.
- Copy every relationship line character-for-character.

State:
- classDef per state category; class StateName styleName for every stylable state.
- CANNOT style [*] or composite state container labels.

FORBIDDEN: adding/removing nodes, entities, edges, actors, states, or transitions.
FORBIDDEN: subgraphs, namespaces, composite state restructuring, direction changes, ELK layout.`,
  },
];

function extractMermaidCode(raw: string): string {
  const fenced = raw.match(/```(?:mermaid)?\s*\n([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }
  return raw.trim();
}

function parseTitle(raw: string | undefined, fallback: string): string {
  const title = raw?.trim();
  if (!title) {
    return fallback;
  }
  return title.length > 120 ? `${title.slice(0, 117)}…` : title;
}

function parseBatchJson(raw: string): DiagramImprovementCard[] | undefined {
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      id?: string;
      title?: string;
      code?: string;
    }>;
    const cards: DiagramImprovementCard[] = [];
    for (const spec of CARD_SPECS) {
      const item = parsed.find((p) => p.id === spec.id) ?? parsed[cards.length];
      if (!item?.code?.trim()) {
        continue;
      }
      cards.push({
        id: spec.id,
        title: parseTitle(item.title, spec.fallbackTitle),
        proposedCode: extractMermaidCode(item.code),
      });
    }
    return cards.length > 0 ? cards.slice(0, MAX_IMPROVEMENT_CARDS) : undefined;
  } catch {
    return undefined;
  }
}

function parseSingleJson(raw: string): { title?: string; code?: string } | undefined {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return undefined;
  }
  try {
    return JSON.parse(jsonMatch[0]) as { title?: string; code?: string };
  } catch {
    return undefined;
  }
}

function buildBatchPrompt(currentCode: string): string {
  return `You are a senior Mermaid diagram editor. Produce exactly 2 improved variants of the input diagram.

Return ONLY a JSON array with exactly 2 objects and no other text:
[
  { "id": "layout", "title": "<specific change summary>", "code": "<full mermaid diagram>" },
  { "id": "styling", "title": "<specific change summary>", "code": "<full mermaid diagram>" }
]

Title rules:
- Each "title" must describe what changed in THAT variant (6–14 words).
- Be specific, e.g. "Group auth and CI/CD into subgraphs with ELK" or "Color all nodes by domain with themeVariables".
- Do NOT use generic titles like "Layout", "Styling", or "Improved diagram".

Before editing, identify the diagram type and list (mentally) all entities/nodes and relationships — every one must appear in both variants. Layout reorganizes grouping; styling keeps the same flat structure but adds full color.

${MERMAID_SEMANTIC_RULES}

${MERMAID_SYNTAX_REFERENCE}

Variant rules:
${CARD_SPECS.map((s) => s.variantRules).join("\n\n")}

${MERMAID_OUTPUT_RULES}

Input diagram:
\`\`\`mermaid
${currentCode}
\`\`\``;
}

function buildSinglePrompt(currentCode: string, spec: (typeof CARD_SPECS)[number]): string {
  return `You are a senior Mermaid diagram editor. Produce ONE improved variant of the input diagram.

Return ONLY a JSON object with no other text:
{ "title": "<specific change summary>", "code": "<full mermaid diagram>" }

Title rules:
- "title" must describe what changed (6–14 words), specific to the diagram.
- Do NOT use generic titles like "${spec.fallbackTitle}" or "Improved diagram".

${MERMAID_SEMANTIC_RULES}

${MERMAID_SYNTAX_REFERENCE}

${spec.variantRules}

${MERMAID_OUTPUT_RULES}

Input diagram:
\`\`\`mermaid
${currentCode}
\`\`\``;
}

async function generateOne(
  currentCode: string,
  spec: (typeof CARD_SPECS)[number],
  options?: GenerateImprovementOptions
): Promise<DiagramImprovementCard | undefined> {
  const raw = await sendLanguageModelUserPrompt(
    buildSinglePrompt(currentCode, spec),
    `Generate a ${spec.fallbackTitle} Mermaid diagram improvement for the VS Code sidebar.`,
    options
  );
  if (!raw?.trim()) {
    return undefined;
  }

  const fromJson = parseSingleJson(raw);
  const proposedCode = extractMermaidCode(fromJson?.code ?? raw);
  if (!proposedCode) {
    return undefined;
  }

  return {
    id: spec.id,
    title: parseTitle(fromJson?.title, spec.fallbackTitle),
    proposedCode,
  };
}

/**
 * Two improvement cards (layout optimization, styling) via the VS Code language model (Copilot / Cursor).
 */
export async function generateDiagramImprovements(
  currentCode: string,
  options?: GenerateImprovementOptions
): Promise<{ cards: DiagramImprovementCard[]; providerName?: string }> {
  if (!currentCode.trim()) {
    return { cards: [] };
  }

  const available = await isLanguageModelAvailable();
  if (!available) {
    return { cards: [] };
  }

  throwIfLanguageModelCancelled(options?.cancellationToken);

  const providerName = await getLanguageModelDisplayName(options?.modelId);

  const batchRaw = await sendLanguageModelUserPrompt(
    buildBatchPrompt(currentCode),
    "Generate two Mermaid diagram improvement variants (layout and styling) for the VS Code sidebar.",
    options
  );

  throwIfLanguageModelCancelled(options?.cancellationToken);

  const fromBatch = batchRaw ? parseBatchJson(batchRaw) : undefined;
  if (fromBatch && fromBatch.length > 0) {
    return { cards: fromBatch.slice(0, MAX_IMPROVEMENT_CARDS), providerName };
  }

  const cards: DiagramImprovementCard[] = [];
  for (const spec of CARD_SPECS) {
    throwIfLanguageModelCancelled(options?.cancellationToken);
    const card = await generateOne(currentCode, spec, options);
    if (card) {
      cards.push(card);
    }
    if (cards.length >= MAX_IMPROVEMENT_CARDS) {
      break;
    }
  }
  return { cards, providerName };
}
