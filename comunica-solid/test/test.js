const path = require("path");
const { config } = require("dotenv");
const ROOT = path.resolve(__dirname, "..");
config({ path: path.join(ROOT, ".env.testing") });

const { spawn } = require("child_process");

const PORT = process.env.PORT || 7200;
const BASE = `http://localhost:${PORT}`;
const SOLID_ENDPOINT = process.env.SOLID_ENDPOINT || "http://localhost:3000";
const SOLID_WEBID = process.env.SOLID_WEBID || `${SOLID_ENDPOINT}/my-pod/card#me`;
// Derive pod base from webId (strip fragment and /profile/card path)
const podUrl = new URL(SOLID_WEBID);
podUrl.hash = "";
const POD_BASE = podUrl.href.replace(/\/profile\/card$/, "/");
const RESOURCE_URL = `${POD_BASE}test-resource`;

let passed = 0;
let failed = 0;
let serverProcess = null;

function assert(condition, message) {
  if (!condition) {
    console.error(`  FAIL: ${message}`);
    failed++;
  } else {
    console.log(`  PASS: ${message}`);
    passed++;
  }
}

function startServer() {
  return new Promise((resolve, reject) => {
    serverProcess = spawn("node", ["--no-warnings", "server.js"], {
      env: { ...process.env },
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let started = false;

    serverProcess.stdout.on("data", (data) => {
      const output = data.toString();
      process.stdout.write(`  [server] ${output}`);
      if (!started && output.includes("running on port")) {
        started = true;
        resolve();
      }
    });

    serverProcess.stderr.on("data", (data) => {
      process.stderr.write(`  [server] ${data.toString()}`);
    });

    serverProcess.on("error", (err) => {
      if (!started) reject(err);
    });

    serverProcess.on("exit", (code) => {
      if (!started) reject(new Error(`Server exited with code ${code} before starting`));
    });

    setTimeout(() => {
      if (!started) reject(new Error("Server did not start within 30s"));
    }, 30000);
  });
}

function stopServer() {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
}

async function testHealth() {
  console.log("\n--- GET /health ---");
  const res = await fetch(`${BASE}/health`);
  const body = await res.json();
  assert(res.status === 200, `status is 200 (got ${res.status})`);
  assert(body.status === "ok", `body.status is "ok"`);
  assert(body.loggedIn === true, `loggedIn is true`);
  assert(typeof body.webId === "string" && body.webId.length > 0, `webId is present`);
}

async function testWrite() {
  console.log("\n--- POST /write ---");
  const turtle = `
    @prefix schema: <https://schema.org/> .
    @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

    <${RESOURCE_URL}#item1>
      a schema:Thing ;
      schema:name "Test Item" ;
      schema:identifier "42"^^xsd:integer .
  `;

  const res = await fetch(`${BASE}/write?url=${encodeURIComponent(RESOURCE_URL)}`, {
    method: "POST",
    headers: { "Content-Type": "text/turtle" },
    body: turtle,
  });
  const body = await res.json();
  assert(res.status === 200, `status is 200 (got ${res.status})`);
  assert(body.status === "created", `body.status is "created"`);
  assert(body.url === RESOURCE_URL, `url matches`);
}

async function testQuery() {
  console.log("\n--- POST /query ---");
  const res = await fetch(`${BASE}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `
        PREFIX schema: <https://schema.org/>
        SELECT ?name WHERE {
          <${RESOURCE_URL}#item1> schema:name ?name .
        }
      `,
    }),
  });
  const body = await res.json();
  assert(res.status === 200, `status is 200 (got ${res.status})`);
  assert(body.head && Array.isArray(body.head.vars), `head.vars is an array`);
  assert(body.results && Array.isArray(body.results.bindings), `results.bindings is an array`);

  const names = body.results.bindings.map((b) => b.name?.value);
  assert(names.includes("Test Item"), `query returned "Test Item"`);
}

async function testModify() {
  console.log("\n--- PUT /modify ---");
  const turtle = `
    @prefix schema: <https://schema.org/> .

    <${RESOURCE_URL}#item1>
      schema:description "A modified test item" .
  `;

  const res = await fetch(`${BASE}/modify?url=${encodeURIComponent(RESOURCE_URL)}`, {
    method: "PUT",
    headers: { "Content-Type": "text/turtle" },
    body: turtle,
  });
  const body = await res.json();
  assert(res.status === 200, `status is 200 (got ${res.status})`);
  assert(body.status === "modified", `body.status is "modified"`);
}

async function testQueryAfterModify() {
  console.log("\n--- POST /query (after modify) ---");
  const res = await fetch(`${BASE}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `
        PREFIX schema: <https://schema.org/>
        SELECT ?name ?desc WHERE {
          <${RESOURCE_URL}#item1> schema:name ?name ;
                                  schema:description ?desc .
        }
      `,
    }),
  });
  const body = await res.json();
  assert(res.status === 200, `status is 200 (got ${res.status})`);

  const bindings = body.results?.bindings || [];
  assert(bindings.length > 0, `got at least one binding`);
  if (bindings.length > 0) {
    assert(bindings[0].name?.value === "Test Item", `name is still "Test Item"`);
    assert(bindings[0].desc?.value === "A modified test item", `description was added`);
  }
}

async function testDelete() {
  console.log("\n--- DELETE /delete ---");
  const res = await fetch(`${BASE}/delete?url=${encodeURIComponent(RESOURCE_URL)}`, {
    method: "DELETE",
  });
  const body = await res.json();
  assert(res.status === 200, `status is 200 (got ${res.status})`);
  assert(body.status === "deleted", `body.status is "deleted"`);
}

async function testValidation() {
  console.log("\n--- Validation: missing parameters ---");

  const r1 = await fetch(`${BASE}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assert(r1.status === 400, `POST /query without query returns 400 (got ${r1.status})`);

  const r2 = await fetch(`${BASE}/write`, {
    method: "POST",
    headers: { "Content-Type": "text/turtle" },
    body: "some turtle",
  });
  assert(r2.status === 400, `POST /write without url returns 400 (got ${r2.status})`);

  const r3 = await fetch(`${BASE}/modify`, {
    method: "PUT",
    headers: { "Content-Type": "text/turtle" },
    body: "some turtle",
  });
  assert(r3.status === 400, `PUT /modify without url returns 400 (got ${r3.status})`);

  const r4 = await fetch(`${BASE}/delete`, { method: "DELETE" });
  assert(r4.status === 400, `DELETE /delete without url returns 400 (got ${r4.status})`);
}

async function run() {
  console.log("Starting server...");
  try {
    await startServer();
  } catch (err) {
    console.error(`\nFATAL: Could not start server: ${err.message}`);
    stopServer();
    process.exit(1);
  }

  console.log(`\nTesting comunica-solid at ${BASE}`);
  console.log(`Solid endpoint: ${SOLID_ENDPOINT}`);

  try {
    await testHealth();
    await testWrite();
    await testQuery();
    await testModify();
    await testQueryAfterModify();
    await testDelete();
    await testValidation();
  } catch (err) {
    console.error(`\nFATAL: ${err.message}`);
    failed++;
  }

  stopServer();

  console.log(`\n=============================`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log(`=============================`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
