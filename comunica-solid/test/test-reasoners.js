const path = require("path");
const { config } = require("dotenv");
const ROOT = path.resolve(__dirname, "..");
config({ path: path.join(ROOT, ".env.testing") });

const { spawn } = require("child_process");

const PORT = process.env.PORT || 7200;
const BASE = `http://localhost:${PORT}`;
const SOLID_ENDPOINT = process.env.SOLID_ENDPOINT || "http://localhost:3000";
const SOLID_WEBID = process.env.SOLID_WEBID || `${SOLID_ENDPOINT}/my-pod/card#me`;
const podUrl = new URL(SOLID_WEBID);
podUrl.hash = "";
const POD_BASE = podUrl.href.replace(/\/profile\/card$/, "/");
const ONTOLOGY_URL = `${POD_BASE}test-ontology`;
const DATA_URL = `${POD_BASE}test-reasoner-data`;

let passed = 0;
let failed = 0;
let serverProcess = null;

const EX = "http://example.org/test#";

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function writeTurtle(url, turtle) {
  const res = await fetch(`${BASE}/write?url=${encodeURIComponent(url)}`, {
    method: "POST",
    headers: { "Content-Type": "text/turtle" },
    body: turtle,
  });
  assert(res.status === 200, `wrote ${url} (status ${res.status})`);
}

async function deleteResource(url) {
  await fetch(`${BASE}/delete?url=${encodeURIComponent(url)}`, { method: "DELETE" });
}

async function query(sparql, reasoner) {
  const body = { query: sparql, startSources: [DATA_URL] };
  if (reasoner) {
    body.reasoner = reasoner;
    body.ontology = ONTOLOGY_TURTLE;
  }

  const start = Date.now();
  const res = await fetch(`${BASE}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const elapsed = Date.now() - start;
  const json = await res.json();

  console.log(`  (${(elapsed / 1000).toFixed(1)}s)`);
  return { status: res.status, body: json };
}

function bindingsOf(result, variable) {
  return (result.body.results?.bindings || []).map((b) => b[variable]?.value);
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const ONTOLOGY_TURTLE = `
  @prefix rdf:  <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
  @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
  @prefix owl:  <http://www.w3.org/2002/07/owl#> .
  @prefix ex:   <${EX}> .

  # ----- RDFS axioms -----
  ex:Animal        rdfs:subClassOf  ex:LivingThing .
  ex:Dog           rdfs:subClassOf  ex:Animal .
  ex:hasPet        rdfs:range       ex:Animal .
  ex:friendlyName  rdfs:subPropertyOf rdfs:label .

  # ----- OWL axioms -----
  ex:Cat           owl:equivalentClass  ex:Feline .
  ex:likes         a owl:TransitiveProperty .
  ex:hasFriend     owl:equivalentProperty ex:friendWith .
  ex:knows         a owl:SymmetricProperty .
  ex:ownedBy       owl:inverseOf    ex:hasPet .
  ex:alice         owl:sameAs       ex:aliceAlt .
`;

const DATA_TURTLE = `
  @prefix rdf:  <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
  @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
  @prefix owl:  <http://www.w3.org/2002/07/owl#> .
  @prefix ex:   <${EX}> .

  ex:fido  a ex:Dog ;
           ex:friendlyName "Fido the Dog" .

  ex:alice ex:hasPet ex:fido .

  ex:whiskers a ex:Cat .

  ex:alice ex:likes ex:bob .
  ex:bob   ex:likes ex:carol .

  ex:alice ex:hasFriend ex:dave .

  ex:alice ex:knows ex:eve .

  ex:aliceAlt rdfs:label "Alice Alternative" .
`;

// ---------------------------------------------------------------------------
// Test: subClassOf — "who is an Animal?"
// ---------------------------------------------------------------------------

async function testSubClassOf(reasoner) {
  const label = reasoner || "none";
  process.stdout.write(`  [${label}] subClassOf: who is an Animal? `);
  const r = await query(
    `PREFIX ex: <${EX}> SELECT ?x WHERE { ?x a ex:Animal }`,
    reasoner
  );
  assert(r.status === 200, `[${label}] status 200`);
  const animals = bindingsOf(r, "x");
  if (reasoner) {
    assert(animals.includes(`${EX}fido`), `[${label}] fido IS Animal (subClassOf inferred)`);
  } else {
    assert(!animals.includes(`${EX}fido`), `[${label}] fido NOT Animal (no reasoning)`);
  }
}

// ---------------------------------------------------------------------------
// Test: transitive subClassOf chain — "who is a LivingThing?"
// ---------------------------------------------------------------------------

async function testSubClassChain(reasoner) {
  const label = reasoner || "none";
  process.stdout.write(`  [${label}] subClassOf chain: who is a LivingThing? `);
  const r = await query(
    `PREFIX ex: <${EX}> SELECT ?x WHERE { ?x a ex:LivingThing }`,
    reasoner
  );
  assert(r.status === 200, `[${label}] status 200`);
  const living = bindingsOf(r, "x");
  if (reasoner) {
    assert(living.includes(`${EX}fido`), `[${label}] fido IS LivingThing (Dog->Animal->LivingThing)`);
  } else {
    assert(!living.includes(`${EX}fido`), `[${label}] fido NOT LivingThing (no reasoning)`);
  }
}

// ---------------------------------------------------------------------------
// Test: subPropertyOf — "what is fido's rdfs:label?"
// ---------------------------------------------------------------------------

async function testSubPropertyOf(reasoner) {
  const label = reasoner || "none";
  process.stdout.write(`  [${label}] subPropertyOf: fido's rdfs:label? `);
  const r = await query(
    `PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
     PREFIX ex: <${EX}>
     SELECT ?lbl WHERE { ex:fido rdfs:label ?lbl }`,
    reasoner
  );
  assert(r.status === 200, `[${label}] status 200`);
  const labels = bindingsOf(r, "lbl");
  if (reasoner) {
    assert(labels.includes("Fido the Dog"), `[${label}] friendlyName promoted to rdfs:label`);
  } else {
    assert(!labels.includes("Fido the Dog"), `[${label}] friendlyName NOT promoted (no reasoning)`);
  }
}

// ---------------------------------------------------------------------------
// Test: equivalentClass — "who is a Feline?"
// ---------------------------------------------------------------------------

async function testEquivalentClass(reasoner) {
  const label = reasoner || "none";
  process.stdout.write(`  [${label}] equivalentClass: who is a Feline? `);
  const r = await query(
    `PREFIX ex: <${EX}> SELECT ?x WHERE { ?x a ex:Feline }`,
    reasoner
  );
  assert(r.status === 200, `[${label}] status 200`);
  const felines = bindingsOf(r, "x");
  if (reasoner) {
    // Hybrid pipeline rewrites equivalentClass at all reasoner levels
    assert(felines.includes(`${EX}whiskers`), `[${label}] whiskers IS Feline (equivalentClass)`);
  } else {
    assert(!felines.includes(`${EX}whiskers`), `[${label}] whiskers NOT Feline`);
  }
}

// ---------------------------------------------------------------------------
// Test: transitiveProperty — "who does alice like?"
// ---------------------------------------------------------------------------

async function testTransitiveProperty(reasoner) {
  const label = reasoner || "none";
  process.stdout.write(`  [${label}] transitiveProperty: who does alice like? `);
  const r = await query(
    `PREFIX ex: <${EX}> SELECT ?who WHERE { ex:alice ex:likes ?who }`,
    reasoner
  );
  assert(r.status === 200, `[${label}] status 200`);
  const liked = bindingsOf(r, "who");
  assert(liked.includes(`${EX}bob`), `[${label}] alice likes bob (explicit)`);
  if (reasoner === "owl-rl") {
    assert(liked.includes(`${EX}carol`), `[${label}] alice likes carol (transitive)`);
  } else {
    assert(!liked.includes(`${EX}carol`), `[${label}] alice does NOT like carol`);
  }
}

// ---------------------------------------------------------------------------
// Test: equivalentProperty — "who is alice friendWith?"
// ---------------------------------------------------------------------------

async function testEquivalentProperty(reasoner) {
  const label = reasoner || "none";
  process.stdout.write(`  [${label}] equivalentProperty: who is alice friendWith? `);
  const r = await query(
    `PREFIX ex: <${EX}> SELECT ?who WHERE { ex:alice ex:friendWith ?who }`,
    reasoner
  );
  assert(r.status === 200, `[${label}] status 200`);
  const friends = bindingsOf(r, "who");
  if (reasoner) {
    // Hybrid pipeline rewrites equivalentProperty at all reasoner levels
    assert(friends.includes(`${EX}dave`), `[${label}] hasFriend => friendWith (equivalentProperty)`);
  } else {
    assert(!friends.includes(`${EX}dave`), `[${label}] hasFriend NOT => friendWith`);
  }
}

// ---------------------------------------------------------------------------
// Test: symmetricProperty — "who does eve know?"
// ---------------------------------------------------------------------------

async function testSymmetricProperty(reasoner) {
  const label = reasoner || "none";
  process.stdout.write(`  [${label}] symmetricProperty: who does eve know? `);
  const r = await query(
    `PREFIX ex: <${EX}> SELECT ?who WHERE { ex:eve ex:knows ?who }`,
    reasoner
  );
  assert(r.status === 200, `[${label}] status 200`);
  const known = bindingsOf(r, "who");
  if (reasoner === "owl-rl") {
    assert(known.includes(`${EX}alice`), `[${label}] eve knows alice (symmetric)`);
  } else {
    assert(!known.includes(`${EX}alice`), `[${label}] eve does NOT know alice`);
  }
}

// ---------------------------------------------------------------------------
// Test: inverseOf — "who owns fido?"
// ---------------------------------------------------------------------------

async function testInverseOf(reasoner) {
  const label = reasoner || "none";
  process.stdout.write(`  [${label}] inverseOf: who owns fido? `);
  const r = await query(
    `PREFIX ex: <${EX}> SELECT ?owner WHERE { ex:fido ex:ownedBy ?owner }`,
    reasoner
  );
  assert(r.status === 200, `[${label}] status 200`);
  const owners = bindingsOf(r, "owner");
  if (reasoner === "owl-rl") {
    assert(owners.includes(`${EX}alice`), `[${label}] fido ownedBy alice (inverseOf)`);
  } else {
    assert(!owners.includes(`${EX}alice`), `[${label}] fido NOT ownedBy alice`);
  }
}

// ---------------------------------------------------------------------------
// Test: sameAs — "what is alice's rdfs:label?"
// ---------------------------------------------------------------------------

async function testSameAs(reasoner) {
  const label = reasoner || "none";
  process.stdout.write(`  [${label}] sameAs: alice's rdfs:label? `);
  const r = await query(
    `PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
     PREFIX ex: <${EX}>
     SELECT ?lbl WHERE { ex:alice rdfs:label ?lbl }`,
    reasoner
  );
  assert(r.status === 200, `[${label}] status 200`);
  const labels = bindingsOf(r, "lbl");
  if (reasoner === "owl-rl") {
    assert(labels.includes("Alice Alternative"), `[${label}] alice gets aliceAlt label (sameAs)`);
  } else {
    assert(!labels.includes("Alice Alternative"), `[${label}] alice has no aliceAlt label`);
  }
}

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

async function testErrors() {
  console.log("\n=== ERROR HANDLING ===");

  process.stdout.write("  unknown reasoner ");
  const start1 = Date.now();
  const r1 = await fetch(`${BASE}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: "SELECT ?s WHERE { ?s ?p ?o }", reasoner: "invalid-reasoner" }),
  });
  console.log(`(${Date.now() - start1}ms)`);
  assert(r1.status === 400, `unknown reasoner returns 400 (got ${r1.status})`);

  process.stdout.write("  missing query ");
  const start2 = Date.now();
  const r2 = await fetch(`${BASE}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reasoner: "rdfs" }),
  });
  console.log(`(${Date.now() - start2}ms)`);
  assert(r2.status === 400, `missing query returns 400 (got ${r2.status})`);
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

const ALL_TESTS = [
  testSubClassOf,
  testSubClassChain,
  testSubPropertyOf,
  testEquivalentClass,
  testTransitiveProperty,
  testEquivalentProperty,
  testSymmetricProperty,
  testInverseOf,
  testSameAs,
];

async function run() {
  const totalStart = Date.now();

  console.log("Starting server...");
  try {
    await startServer();
  } catch (err) {
    console.error(`\nFATAL: Could not start server: ${err.message}`);
    stopServer();
    process.exit(1);
  }

  console.log(`\nTesting reasoners at ${BASE}`);
  console.log(`Solid endpoint: ${SOLID_ENDPOINT}\n`);

  try {
    // Setup
    console.log("=== SETUP: writing ontology and data ===");
    await writeTurtle(ONTOLOGY_URL, ONTOLOGY_TURTLE);
    await writeTurtle(DATA_URL, DATA_TURTLE);

    // Run every test for each reasoner mode sequentially
    for (const mode of [undefined, "rdfs", "owl-rl"]) {
      const modeLabel = mode || "none";
      const modeStart = Date.now();
      console.log(`\n=== ${modeLabel.toUpperCase()} ===`);

      for (const testFn of ALL_TESTS) {
        await testFn(mode);
      }

      const modeElapsed = ((Date.now() - modeStart) / 1000).toFixed(1);
      console.log(`  --- ${modeLabel} total: ${modeElapsed}s ---`);
    }

    await testErrors();
  } catch (err) {
    console.error(`\nFATAL: ${err.message}`);
    failed++;
  } finally {
    console.log("\n=== CLEANUP ===");
    await deleteResource(DATA_URL);
    await deleteResource(ONTOLOGY_URL);
  }

  stopServer();

  const totalElapsed = ((Date.now() - totalStart) / 1000).toFixed(1);
  console.log(`\n=============================`);
  console.log(`Results: ${passed} passed, ${failed} failed (${totalElapsed}s)`);
  console.log(`=============================`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
