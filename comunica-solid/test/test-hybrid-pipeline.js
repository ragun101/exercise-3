/**
 * Integration tests for the full hybrid pipeline (runSparqlHybrid).
 *
 * Uses the standard Comunica engine with in-memory N3 Stores as sources,
 * so no Solid pod or network access is needed. This tests the entire flow:
 *   rewrite → decompose → per-branch query → source discovery →
 *   full fetch → ontology load → reasoning → re-execute original query
 */
const { QueryEngine } = require("@comunica/query-sparql-solid");
const { Store, DataFactory, Parser: N3Parser } = require("n3");
const { Parser: SparqlParser, Generator: SparqlGenerator } = require("sparqljs");
const { rewriteQuery, OntologyIndex } = require("../query-rewriter");
const { applyReasoner } = require("../reasoners");

const { namedNode, literal, blankNode, quad } = DataFactory;

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`  FAIL: ${message}`);
    failed++;
  } else {
    console.log(`  PASS: ${message}`);
    passed++;
  }
}

// ---------------------------------------------------------------------------
// Helpers — replicate the hybrid pipeline logic from sparql.js
// ---------------------------------------------------------------------------

function collectBgpTriples(patterns) {
  const triples = [];
  for (const node of patterns) {
    if (node.type === "bgp") triples.push(...node.triples);
    else if (node.type === "group" || node.type === "optional")
      triples.push(...collectBgpTriples(node.patterns));
  }
  return triples;
}

function decomposeBranches(whereClause) {
  const unions = [];
  const nonUnion = [];

  for (const node of whereClause) {
    if (node.type === "union") {
      for (const alt of node.patterns) {
        const altPatterns =
          alt.type === "bgp" ? [alt] : alt.patterns || [alt];
        unions.push(altPatterns);
      }
    } else {
      nonUnion.push(node);
    }
  }

  if (unions.length === 0) {
    if (nonUnion.length === 0) return [];
    return [
      { patterns: nonUnion, triples: collectBgpTriples(nonUnion) },
    ];
  }

  const branches = [];
  for (const altPatterns of unions) {
    const combined = [...altPatterns, ...nonUnion];
    branches.push({
      patterns: combined,
      triples: collectBgpTriples(combined),
    });
  }
  if (nonUnion.length > 0) {
    branches.push({
      patterns: nonUnion,
      triples: collectBgpTriples(nonUnion),
    });
  }
  return branches;
}

function resolveTerm(term, binding) {
  if (term.termType === "Variable") return binding.get(term.value) || null;
  if (term.type === "path" && term.items && term.items.length > 0)
    return namedNode(term.items[0].value);
  return namedNode(term.value);
}

function bindingsToResult(bindings) {
  const variables =
    bindings.length > 0 ? [...bindings[0].keys()].map((k) => k.value) : [];
  const results = bindings.map((binding) => {
    const row = {};
    for (const variable of variables) {
      const term = binding.get(variable);
      if (term) {
        row[variable] = {
          type: term.termType === "NamedNode" ? "uri" : "literal",
          value: term.value,
        };
      }
    }
    return row;
  });
  return { head: { vars: variables }, results: { bindings: results } };
}

/**
 * Simulate runSparqlHybrid using the standard engine against an N3 store.
 * This mirrors the real pipeline in sparql.js but uses a single store as
 * both the link-traversal engine and the standard engine source.
 */
async function simulateHybridPipeline(
  dataStore,
  query,
  ontologyTurtle,
  reasonerName
) {
  const engine = new QueryEngine();
  const sparqlParser = new SparqlParser();
  const sparqlGenerator = new SparqlGenerator();

  // Step 1: rewrite
  const { rewrittenQuery, ontologyIndex } = rewriteQuery(
    query,
    ontologyTurtle,
    reasonerName
  );

  // Step 2: decompose
  const rewrittenAst = sparqlParser.parse(rewrittenQuery);
  const branches = decomposeBranches(rewrittenAst.where);

  // Step 3-4: run branches, reconstruct quads, collect sources
  const resultStore = new Store();
  const discoveredSources = new Set();

  for (const branch of branches) {
    const branchAst = {
      ...rewrittenAst,
      variables: [{ termType: "Wildcard", value: "*" }],
      where: branch.patterns,
    };
    const branchQuery = sparqlGenerator.stringify(branchAst);

    const bindingsStream = await engine.queryBindings(branchQuery, {
      sources: [dataStore],
    });
    const bindings = await bindingsStream.toArray();

    for (const binding of bindings) {
      for (const tp of branch.triples) {
        const s = resolveTerm(tp.subject, binding);
        const p = resolveTerm(tp.predicate, binding);
        const o = resolveTerm(tp.object, binding);
        if (s && p && o) resultStore.addQuad(s, p, o);
      }
      for (const [, term] of binding) {
        if (term.termType === "NamedNode") discoveredSources.add(term.value);
      }
    }
  }

  // Step 5: full fetch from discovered sources (simulated — just copy all
  // triples from the data store, since we can't filter by source URL in
  // an in-memory store; this mirrors the real behaviour where the standard
  // engine fetches ?s ?p ?o from the discovered URLs)
  for (const q of dataStore.getQuads()) {
    resultStore.addQuad(q);
  }

  // Step 6: add ontology + reason
  resultStore.addQuads(ontologyIndex.store.getQuads());
  applyReasoner(reasonerName, resultStore);

  // Step 7: re-execute original query
  const resultStream = await engine.queryBindings(query, {
    sources: [resultStore],
  });
  const resultBindings = await resultStream.toArray();
  return bindingsToResult(resultBindings);
}

// ---------------------------------------------------------------------------
// Test data — mirrors the SAMOD agriculture domain
// ---------------------------------------------------------------------------

const WAS = "https://was-course.interactions.ics.unisg.ch/farm-ontology#";
const TD = "https://www.w3.org/2019/wot/td#";
const HMAS = "https://purl.org/hmas/";
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";

const ONTOLOGY = require("fs").readFileSync(
  require("path").resolve(__dirname, "../../SAMOD/agriculture-domain/tbox.ttl"),
  "utf-8"
);

function buildFarmStore() {
  const store = new Store();
  const farm = namedNode("http://pod/farm");

  // Farm
  store.addQuad(farm, namedNode(RDF_TYPE), namedNode(WAS + "Farm"));

  // Tractor 1: explicit ReadSoilMoistureAffordance
  const t1 = namedNode("http://pod/tractor/tractor1");
  const aff1 = blankNode("aff1");
  store.addQuad(farm, namedNode(HMAS + "contains"), t1);
  store.addQuad(t1, namedNode(RDF_TYPE), namedNode(WAS + "Tractor"));
  store.addQuad(t1, namedNode(RDF_TYPE), namedNode(TD + "Thing"));
  store.addQuad(t1, namedNode(TD + "hasActionAffordance"), aff1);
  store.addQuad(t1, namedNode(HMAS + "hasProfile"), namedNode("https://example.org/tds/tractor1.ttl"));
  store.addQuad(aff1, namedNode(RDF_TYPE), namedNode(TD + "ActionAffordance"));
  store.addQuad(aff1, namedNode(RDF_TYPE), namedNode(WAS + "ReadSoilMoistureAffordance"));
  store.addQuad(aff1, namedNode(TD + "name"), literal("Read Moisture Level"));

  // Tractor 2: explicit IrrigateAffordance
  const t2 = namedNode("http://pod/tractor/tractor2");
  const aff2 = blankNode("aff2");
  store.addQuad(farm, namedNode(HMAS + "contains"), t2);
  store.addQuad(t2, namedNode(RDF_TYPE), namedNode(WAS + "Tractor"));
  store.addQuad(t2, namedNode(RDF_TYPE), namedNode(TD + "Thing"));
  store.addQuad(t2, namedNode(TD + "hasActionAffordance"), aff2);
  store.addQuad(t2, namedNode(HMAS + "hasProfile"), namedNode("https://example.org/tds/tractor2.ttl"));
  store.addQuad(aff2, namedNode(RDF_TYPE), namedNode(TD + "ActionAffordance"));
  store.addQuad(aff2, namedNode(RDF_TYPE), namedNode(WAS + "IrrigateAffordance"));
  store.addQuad(aff2, namedNode(TD + "name"), literal("Irrigate"));

  // Tractor 3: only td:ActionAffordance + td:name "Irrigate" (no explicit was:IrrigateAffordance)
  const t3 = namedNode("http://pod/tractor/tractor3");
  const aff3 = blankNode("aff3");
  store.addQuad(farm, namedNode(HMAS + "contains"), t3);
  store.addQuad(t3, namedNode(RDF_TYPE), namedNode(WAS + "Tractor"));
  store.addQuad(t3, namedNode(RDF_TYPE), namedNode(TD + "Thing"));
  store.addQuad(t3, namedNode(TD + "hasActionAffordance"), aff3);
  store.addQuad(t3, namedNode(HMAS + "hasProfile"), namedNode("https://example.org/tds/tractor3.ttl"));
  store.addQuad(aff3, namedNode(RDF_TYPE), namedNode(TD + "ActionAffordance"));
  store.addQuad(aff3, namedNode(TD + "name"), literal("Irrigate"));

  // Tractor 4: only td:ActionAffordance + td:name "Read Moisture Level" (no explicit was:ReadSoilMoistureAffordance)
  const t4 = namedNode("http://pod/tractor/tractor4");
  const aff4 = blankNode("aff4");
  store.addQuad(farm, namedNode(HMAS + "contains"), t4);
  store.addQuad(t4, namedNode(RDF_TYPE), namedNode(WAS + "Tractor"));
  store.addQuad(t4, namedNode(RDF_TYPE), namedNode(TD + "Thing"));
  store.addQuad(t4, namedNode(TD + "hasActionAffordance"), aff4);
  store.addQuad(t4, namedNode(HMAS + "hasProfile"), namedNode("https://example.org/tds/tractor4.ttl"));
  store.addQuad(aff4, namedNode(RDF_TYPE), namedNode(TD + "ActionAffordance"));
  store.addQuad(aff4, namedNode(TD + "name"), literal("Read Moisture Level"));

  return store;
}

const QUERY_READ_MOISTURE = `
  PREFIX was: <${WAS}>
  PREFIX hmas: <${HMAS}>
  PREFIX td: <${TD}>
  SELECT ?td WHERE {
    ?farm a was:Farm.
    ?farm hmas:contains ?tractor.
    ?tractor a was:Tractor.
    ?tractor td:hasActionAffordance ?aff.
    ?tractor hmas:hasProfile ?td.
    ?aff a was:ReadSoilMoistureAffordance.
  }
`;

const QUERY_IRRIGATE = `
  PREFIX was: <${WAS}>
  PREFIX hmas: <${HMAS}>
  PREFIX td: <${TD}>
  SELECT ?td WHERE {
    ?farm a was:Farm.
    ?farm hmas:contains ?tractor.
    ?tractor a was:Tractor.
    ?tractor td:hasActionAffordance ?aff.
    ?tractor hmas:hasProfile ?td.
    ?aff a was:IrrigateAffordance.
  }
`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function testNoReasoning() {
  console.log("\n=== No reasoning (baseline) ===");
  const store = buildFarmStore();
  const engine = new QueryEngine();

  const stream = await engine.queryBindings(QUERY_READ_MOISTURE, { sources: [store] });
  const bindings = await stream.toArray();
  const tds = bindings.map((b) => b.get("td")?.value);

  assert(tds.length === 1, `without reasoning: 1 ReadSoilMoisture result (got ${tds.length})`);
  assert(
    tds.includes("https://example.org/tds/tractor1.ttl"),
    "without reasoning: tractor1 found"
  );
}

async function testHybridReadMoisture() {
  console.log("\n=== Hybrid pipeline: ReadSoilMoistureAffordance (OWL-RL) ===");
  const store = buildFarmStore();
  const result = await simulateHybridPipeline(
    store,
    QUERY_READ_MOISTURE,
    ONTOLOGY,
    "owl-rl"
  );

  const tds = [...new Set(result.results.bindings.map((b) => b.td?.value))];

  assert(tds.length === 2, `OWL-RL ReadSoilMoisture: 2 distinct results (got ${tds.length})`);
  assert(
    tds.includes("https://example.org/tds/tractor1.ttl"),
    "OWL-RL ReadSoilMoisture: tractor1 found (explicit type)"
  );
  assert(
    tds.includes("https://example.org/tds/tractor4.ttl"),
    "OWL-RL ReadSoilMoisture: tractor4 found (inferred via intersectionOf)"
  );
}

async function testHybridIrrigate() {
  console.log("\n=== Hybrid pipeline: IrrigateAffordance (OWL-RL) ===");
  const store = buildFarmStore();
  const result = await simulateHybridPipeline(
    store,
    QUERY_IRRIGATE,
    ONTOLOGY,
    "owl-rl"
  );

  const tds = [...new Set(result.results.bindings.map((b) => b.td?.value))];

  assert(tds.length === 2, `OWL-RL Irrigate: 2 distinct results (got ${tds.length})`);
  assert(
    tds.includes("https://example.org/tds/tractor2.ttl"),
    "OWL-RL Irrigate: tractor2 found (explicit type)"
  );
  assert(
    tds.includes("https://example.org/tds/tractor3.ttl"),
    "OWL-RL Irrigate: tractor3 found (inferred via intersectionOf)"
  );
}

async function testHybridReturnsAtLeastBaseline() {
  console.log("\n=== Hybrid pipeline must return at least baseline results ===");
  const store = buildFarmStore();

  // RDFS reasoning should still find the explicitly typed tractor
  const result = await simulateHybridPipeline(
    store,
    QUERY_READ_MOISTURE,
    ONTOLOGY,
    "rdfs"
  );

  const tds = result.results.bindings.map((b) => b.td?.value);

  assert(tds.length >= 1, `RDFS ReadSoilMoisture: at least 1 result (got ${tds.length})`);
  assert(
    tds.includes("https://example.org/tds/tractor1.ttl"),
    "RDFS: tractor1 still found (reasoning must not lose baseline results)"
  );
}

async function testSelectProjection() {
  console.log("\n=== SELECT projection: branch queries use SELECT * ===");

  // This tests the bug where SELECT ?td in branches dropped other bindings,
  // preventing quad reconstruction.
  const store = buildFarmStore();
  const engine = new QueryEngine();
  const sparqlParser = new SparqlParser();
  const sparqlGenerator = new SparqlGenerator();

  const { rewrittenQuery } = rewriteQuery(QUERY_READ_MOISTURE, ONTOLOGY, "rdfs");
  const rewrittenAst = sparqlParser.parse(rewrittenQuery);
  const branches = decomposeBranches(rewrittenAst.where);

  // At least one branch should match and return bindings with all variables
  let totalBindings = 0;
  let allVarsPresent = true;

  for (const branch of branches) {
    const branchAst = {
      ...rewrittenAst,
      variables: [{ termType: "Wildcard", value: "*" }],
      where: branch.patterns,
    };
    const branchQuery = sparqlGenerator.stringify(branchAst);

    const stream = await engine.queryBindings(branchQuery, { sources: [store] });
    const bindings = await stream.toArray();
    totalBindings += bindings.length;

    for (const binding of bindings) {
      // All query variables should be bound (farm, tractor, aff, td)
      for (const varName of ["farm", "tractor", "aff", "td"]) {
        if (!binding.get(varName)) {
          allVarsPresent = false;
        }
      }
    }
  }

  assert(totalBindings > 0, `branches produced ${totalBindings} bindings (>0)`);
  assert(allVarsPresent, "all variables (farm, tractor, aff, td) present in bindings");
}

async function testBranchDecompositionPreservesJoin() {
  console.log("\n=== Branch decomposition preserves joins ===");

  const sparqlParser = new SparqlParser();
  const { rewrittenQuery } = rewriteQuery(QUERY_READ_MOISTURE, ONTOLOGY, "rdfs");
  const rewrittenAst = sparqlParser.parse(rewrittenQuery);
  const branches = decomposeBranches(rewrittenAst.where);

  // Every branch that has a UNION alternative should also have the non-UNION patterns
  for (let i = 0; i < branches.length; i++) {
    const triples = branches[i].triples;
    const predicates = triples.map((t) => t.predicate?.value || "");

    if (predicates.includes(RDF_TYPE)) {
      // This branch has a type pattern — it should also have structural patterns
      const hasContains = predicates.some((p) => p === HMAS + "contains");
      const hasProfile = predicates.some((p) => p === HMAS + "hasProfile");
      const hasAffordance = predicates.some((p) => p === TD + "hasActionAffordance");

      // The base fetch branch (last one) may not have the type UNION pattern,
      // but every UNION branch should have structural patterns
      if (i < branches.length - 1) {
        assert(
          hasContains && hasProfile && hasAffordance,
          `branch ${i}: has structural patterns alongside type pattern`
        );
      }
    }
  }
}

async function testQuadReconstruction() {
  console.log("\n=== Quad reconstruction from bindings ===");

  const store = buildFarmStore();
  const engine = new QueryEngine();
  const sparqlParser = new SparqlParser();
  const sparqlGenerator = new SparqlGenerator();

  const { rewrittenQuery } = rewriteQuery(QUERY_READ_MOISTURE, ONTOLOGY, "rdfs");
  const rewrittenAst = sparqlParser.parse(rewrittenQuery);
  const branches = decomposeBranches(rewrittenAst.where);

  const resultStore = new Store();

  for (const branch of branches) {
    const branchAst = {
      ...rewrittenAst,
      variables: [{ termType: "Wildcard", value: "*" }],
      where: branch.patterns,
    };
    const branchQuery = sparqlGenerator.stringify(branchAst);
    const stream = await engine.queryBindings(branchQuery, { sources: [store] });
    const bindings = await stream.toArray();

    for (const binding of bindings) {
      for (const tp of branch.triples) {
        const s = resolveTerm(tp.subject, binding);
        const p = resolveTerm(tp.predicate, binding);
        const o = resolveTerm(tp.object, binding);
        if (s && p && o) resultStore.addQuad(s, p, o);
      }
    }
  }

  // The reconstructed store should have key structural quads
  const farmQuads = resultStore.getQuads(null, namedNode(RDF_TYPE), namedNode(WAS + "Farm"));
  assert(farmQuads.length > 0, "reconstructed store has Farm type quad");

  const tractorQuads = resultStore.getQuads(null, namedNode(RDF_TYPE), namedNode(WAS + "Tractor"));
  assert(tractorQuads.length > 0, "reconstructed store has Tractor type quads");

  const profileQuads = resultStore.getQuads(null, namedNode(HMAS + "hasProfile"), null);
  assert(profileQuads.length > 0, "reconstructed store has hasProfile quads");

  const affTypeQuads = resultStore.getQuads(null, namedNode(RDF_TYPE), namedNode(WAS + "ReadSoilMoistureAffordance"));
  assert(affTypeQuads.length > 0, "reconstructed store has ReadSoilMoistureAffordance type quad");
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function run() {
  const start = Date.now();
  console.log("Testing hybrid pipeline (integration)\n");

  await testNoReasoning();
  await testHybridReturnsAtLeastBaseline();
  await testHybridReadMoisture();
  await testHybridIrrigate();
  await testSelectProjection();
  await testBranchDecompositionPreservesJoin();
  await testQuadReconstruction();

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n=============================`);
  console.log(`Results: ${passed} passed, ${failed} failed (${elapsed}s)`);
  console.log(`=============================`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
