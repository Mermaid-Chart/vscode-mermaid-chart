import * as assert from "assert";
import * as vscode from "vscode";
import { detectBestDiagramType } from "../../services/diagramDetector";

suite("DiagramDetector", () => {
  async function makeDoc(content: string, languageId: string): Promise<vscode.TextDocument> {
    return vscode.workspace.openTextDocument({ content, language: languageId });
  }

  test("detects classDiagram for multiple classes", async () => {
    const doc = await makeDoc(
      `class Animal {
  name: string;
}
class Dog extends Animal {
  bark(): void {}
}
class Cat extends Animal {
  meow(): void {}
}`,
      "typescript"
    );
    const result = detectBestDiagramType(doc);
    assert.strictEqual(result.type, "classDiagram");
    assert.strictEqual(result.confidence, "high");
  });

  test("detects erDiagram for SQL schema", async () => {
    const doc = await makeDoc(
      `CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL
);
CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id)
);`,
      "sql"
    );
    const result = detectBestDiagramType(doc);
    assert.strictEqual(result.type, "erDiagram");
    assert.strictEqual(result.confidence, "high");
  });

  test("detects architecture for Dockerfile", async () => {
    const doc = await makeDoc(
      `FROM node:18-alpine
WORKDIR /app
COPY package.json .
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "start"]`,
      "dockerfile"
    );
    const result = detectBestDiagramType(doc);
    assert.strictEqual(result.type, "architecture-beta");
  });

  test("detects sequenceDiagram for function-heavy code with imports", async () => {
    const doc = await makeDoc(
      `import { fetchUser } from './api';
import { formatName } from './utils';
import { sendEmail } from './mailer';

function processRegistration(email: string) {
  const user = fetchUser(email);
  const name = formatName(user.name);
  sendEmail(name, email);
}

function handleWebhook(payload: any) {
  processRegistration(payload.email);
}

function validatePayload(payload: any) {
  return !!payload.email;
}`,
      "typescript"
    );
    const result = detectBestDiagramType(doc);
    assert.ok(
      result.type === "sequenceDiagram" || result.type === "flowchart",
      `Expected sequenceDiagram or flowchart, got ${result.type}`
    );
  });

  test("detects flowchart for basic functions", async () => {
    const doc = await makeDoc(
      `def step_one():
    pass

def step_two():
    pass`,
      "python"
    );
    const result = detectBestDiagramType(doc);
    assert.strictEqual(result.type, "flowchart");
  });

  test("detects stateDiagram for state management code", async () => {
    const doc = await makeDoc(
      `enum AppState { Idle, Loading, Loaded, Error }
function setState(newState: AppState) { state = newState; }
function transition(from: AppState, to: AppState) { setState(to); }
const STATE_IDLE = 'idle';
const STATE_LOADING = 'loading';`,
      "typescript"
    );
    const result = detectBestDiagramType(doc);
    assert.strictEqual(result.type, "stateDiagram-v2");
  });

  test("returns flowchart as fallback for ambiguous code", async () => {
    const doc = await makeDoc(
      `const x = 1;
console.log(x);`,
      "javascript"
    );
    const result = detectBestDiagramType(doc);
    assert.strictEqual(result.type, "flowchart");
    assert.strictEqual(result.confidence, "low");
  });

  test("detects erDiagram for Prisma schema", async () => {
    const doc = await makeDoc(
      `model User {
  id Int @id @default(autoincrement())
  email String @unique
  posts Post[]
}

model Post {
  id Int @id @default(autoincrement())
  title String
  author User @relation(fields: [authorId], references: [id])
  authorId Int
}`,
      "plaintext"
    );
    const result = detectBestDiagramType(doc);
    assert.strictEqual(result.type, "erDiagram");
  });
});
