/**
 * Tests that ontologies containing blank nodes (anonymous class expressions)
 * are correctly skolemized so the query rewriter produces valid SPARQL.
 */
const { Parser, Generator } = require("sparqljs");
const { OntologyIndex } = require("../query-rewriter/ontology-index");
const { rewriteQuery } = require("../query-rewriter");

const parser = new Parser();
const generator = new Generator();

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

// Ontology with blank nodes — mirrors the real tbox.ttl structure
const BNODE_ONTOLOGY = `
  @base <https://was-course.interactions.ics.unisg.ch/farm-ontology#> .
  @prefix was: <https://was-course.interactions.ics.unisg.ch/farm-ontology#> .
  @prefix owl: <http://www.w3.org/2002/07/owl#> .
  @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
  @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
  @prefix td: <https://www.w3.org/2019/wot/td#> .

  was:Farm rdf:type owl:Class .
  was:Tractor rdf:type owl:Class .

  was:ReadSoilMoistureAffordance rdf:type owl:Class ;
    owl:equivalentClass [ rdf:type owl:Class ;
                          owl:intersectionOf ( td:ActionAffordance
                                               [ rdf:type owl:Restriction ;
                                                 owl:onProperty td:name ;
                                                 owl:hasValue "Read Moisture Level" ] ) ] .

  was:IrrigateAffordance rdf:type owl:Class ;
    owl:equivalentClass [ rdf:type owl:Class ;
                          owl:intersectionOf ( td:ActionAffordance
                                               [ rdf:type owl:Restriction ;
                                                 owl:onProperty td:name ;
                                                 owl:hasValue "Irrigate" ] ) ] .
`;

// Ontology with blank nodes in subclass chains
const BNODE_SUBCLASS_ONTOLOGY = `
  @prefix owl: <http://www.w3.org/2002/07/owl#> .
  @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
  @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
  @prefix ex: <http://example.org/test#> .

  ex:Dog rdfs:subClassOf ex:Animal .
  ex:Animal rdfs:subClassOf ex:LivingThing .

  ex:SmartAnimal owl:equivalentClass [ rdf:type owl:Class ;
    owl:intersectionOf ( ex:Animal
                         [ rdf:type owl:Restriction ;
                           owl:onProperty ex:hasIQ ;
                           owl:minCardinality 1 ] ) ] .
`;

// Ontology mixing named and blank equivalentClass targets
const MIXED_ONTOLOGY = `
  @prefix owl: <http://www.w3.org/2002/07/owl#> .
  @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
  @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
  @prefix ex: <http://example.org/test#> .

  ex:Cat owl:equivalentClass ex:Feline .
  ex:Dog rdfs:subClassOf ex:Animal .

  ex:WorkingDog owl:equivalentClass [ rdf:type owl:Class ;
    owl:intersectionOf ( ex:Dog
                         [ rdf:type owl:Restriction ;
                           owl:onProperty ex:hasJob ;
                           owl:minCardinality 1 ] ) ] .
`;

// ---------------------------------------------------------------------------
// OntologyIndex with blank nodes
// ---------------------------------------------------------------------------

function testOntologyIndexBnodes() {
  console.log("\n=== OntologyIndex with blank nodes ===");

  // Basic: constructing an index with blank nodes should not throw
  {
    let threw = false;
    try {
      new OntologyIndex(BNODE_ONTOLOGY);
    } catch (e) {
      threw = true;
    }
    assert(!threw, "OntologyIndex construction with blank node ontology does not throw");
  }

  // The store should contain no BlankNode terms after skolemization
  {
    const idx = new OntologyIndex(BNODE_ONTOLOGY);
    const allQuads = idx.store.getQuads();
    const hasBlank = allQuads.some(
      (q) =>
        q.subject.termType === "BlankNode" ||
        q.predicate.termType === "BlankNode" ||
        q.object.termType === "BlankNode"
    );
    assert(!hasBlank, "store contains no BlankNode terms after skolemization");
  }

  // Skolemized nodes should use the well-known genid base
  {
    const idx = new OntologyIndex(BNODE_ONTOLOGY);
    const allQuads = idx.store.getQuads();
    const skolemNodes = allQuads
      .flatMap((q) => [q.subject, q.predicate, q.object])
      .filter((t) => t.value.startsWith("http://example.org/.well-known/genid/"));
    assert(skolemNodes.length > 0, "skolemized URIs use .well-known/genid/ base");
  }

  // equivalentClass with blank node target should still create subClassOf links
  {
    const idx = new OntologyIndex(BNODE_ONTOLOGY);
    const WAS = "https://was-course.interactions.ics.unisg.ch/farm-ontology#";
    const subRead = idx.getAllSubClasses(`${WAS}ReadSoilMoistureAffordance`);
    // The skolemized blank node should appear as a subclass
    assert(subRead.size > 0, "ReadSoilMoistureAffordance has subclasses (skolemized blank node)");

    // And the reverse direction
    const skolemUri = [...subRead][0];
    const subSkolem = idx.getAllSubClasses(skolemUri);
    assert(
      subSkolem.has(`${WAS}ReadSoilMoistureAffordance`),
      "skolemized node has ReadSoilMoistureAffordance as subclass (bidirectional equivalentClass)"
    );
  }
}

// ---------------------------------------------------------------------------
// Query rewriting with blank node ontology produces valid SPARQL
// ---------------------------------------------------------------------------

function testRewriteWithBnodes() {
  console.log("\n=== Query rewriting with blank node ontology ===");

  const WAS = "https://was-course.interactions.ics.unisg.ch/farm-ontology#";

  // The core bug: rewriteQuery must produce valid SPARQL even with blank node ontology
  {
    const query = `
      PREFIX was: <${WAS}>
      PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
      SELECT ?x WHERE { ?x rdf:type was:ReadSoilMoistureAffordance }
    `;
    let rewrittenQuery;
    let threw = false;
    try {
      const result = rewriteQuery(query, BNODE_ONTOLOGY, "rdfs");
      rewrittenQuery = result.rewrittenQuery;
    } catch (e) {
      threw = true;
      console.error(`    Error: ${e.message}`);
    }
    assert(!threw, "rewriteQuery with blank node ontology does not throw");

    // The rewritten query must be parseable by sparqljs
    if (rewrittenQuery) {
      let parseable = false;
      try {
        parser.parse(rewrittenQuery);
        parseable = true;
      } catch (e) {
        console.error(`    Parse error: ${e.message}`);
      }
      assert(parseable, "rewritten query is valid SPARQL (no relative IRI errors)");
    }
  }

  // IrrigateAffordance too
  {
    const query = `
      PREFIX was: <${WAS}>
      PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
      SELECT ?x WHERE { ?x rdf:type was:IrrigateAffordance }
    `;
    let parseable = false;
    try {
      const { rewrittenQuery } = rewriteQuery(query, BNODE_ONTOLOGY, "rdfs");
      parser.parse(rewrittenQuery);
      parseable = true;
    } catch (e) {
      console.error(`    Error: ${e.message}`);
    }
    assert(parseable, "IrrigateAffordance rewrite produces valid SPARQL");
  }

  // OWL-RL level should also work
  {
    const query = `
      PREFIX was: <${WAS}>
      PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
      SELECT ?x WHERE { ?x rdf:type was:ReadSoilMoistureAffordance }
    `;
    let parseable = false;
    try {
      const { rewrittenQuery } = rewriteQuery(query, BNODE_ONTOLOGY, "owl-rl");
      parser.parse(rewrittenQuery);
      parseable = true;
    } catch (e) {
      console.error(`    Error: ${e.message}`);
    }
    assert(parseable, "OWL-RL rewrite with blank node ontology produces valid SPARQL");
  }

  // Query that doesn't reference the blank-node-related classes should be unaffected
  {
    const query = `
      PREFIX was: <${WAS}>
      PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
      SELECT ?x WHERE { ?x rdf:type was:Farm }
    `;
    let parseable = false;
    try {
      const { rewrittenQuery } = rewriteQuery(query, BNODE_ONTOLOGY, "rdfs");
      parser.parse(rewrittenQuery);
      parseable = true;
    } catch (e) {
      console.error(`    Error: ${e.message}`);
    }
    assert(parseable, "query for class without blank nodes still valid");
  }
}

// ---------------------------------------------------------------------------
// Mixed ontology: named + blank equivalentClass targets
// ---------------------------------------------------------------------------

function testMixedOntology() {
  console.log("\n=== Mixed ontology (named + blank equivalentClass) ===");
  const EX = "http://example.org/test#";

  // Named equivalentClass still works (Cat <-> Feline)
  {
    const idx = new OntologyIndex(MIXED_ONTOLOGY);
    const subCat = idx.getAllSubClasses(`${EX}Cat`);
    assert(subCat.has(`${EX}Feline`), "named equivalentClass still works: Feline is subclass of Cat");
  }

  // Subclass chain still works
  {
    const idx = new OntologyIndex(MIXED_ONTOLOGY);
    const subAnimal = idx.getAllSubClasses(`${EX}Animal`);
    assert(subAnimal.has(`${EX}Dog`), "subClassOf still works: Dog is subclass of Animal");
  }

  // Blank node equivalentClass produces valid rewrite
  {
    const query = `PREFIX ex: <${EX}> SELECT ?x WHERE { ?x a ex:WorkingDog }`;
    let parseable = false;
    try {
      const { rewrittenQuery } = rewriteQuery(query, MIXED_ONTOLOGY, "rdfs");
      parser.parse(rewrittenQuery);
      parseable = true;
    } catch (e) {
      console.error(`    Error: ${e.message}`);
    }
    assert(parseable, "WorkingDog (equivalentClass with blank node) produces valid SPARQL");
  }

  // Full chain: query for Animal should expand to Dog (and WorkingDog's skolem),
  // and the result should be valid SPARQL
  {
    const query = `PREFIX ex: <${EX}> SELECT ?x WHERE { ?x a ex:Animal }`;
    let rewrittenQuery;
    try {
      const result = rewriteQuery(query, MIXED_ONTOLOGY, "rdfs");
      rewrittenQuery = result.rewrittenQuery;
      parser.parse(rewrittenQuery);
      assert(true, "Animal expansion with mixed ontology is valid SPARQL");
    } catch (e) {
      assert(false, `Animal expansion failed: ${e.message}`);
    }
    if (rewrittenQuery) {
      assert(rewrittenQuery.includes("Dog"), "Animal expansion includes Dog");
    }
  }
}

// ---------------------------------------------------------------------------
// Blank nodes in subclass chain ontology
// ---------------------------------------------------------------------------

function testBnodeSubclassChain() {
  console.log("\n=== Blank nodes in subclass chain ===");
  const EX = "http://example.org/test#";

  // SmartAnimal equivalentClass [bnode], so subclass traversal from
  // SmartAnimal should find the skolemized node and vice versa
  {
    const idx = new OntologyIndex(BNODE_SUBCLASS_ONTOLOGY);
    const subSmart = idx.getAllSubClasses(`${EX}SmartAnimal`);
    assert(subSmart.size > 0, "SmartAnimal has subclasses via equivalentClass skolemization");
  }

  // Rewriting a query for LivingThing should still find Animal and Dog
  {
    const query = `PREFIX ex: <${EX}> SELECT ?x WHERE { ?x a ex:LivingThing }`;
    const { rewrittenQuery } = rewriteQuery(query, BNODE_SUBCLASS_ONTOLOGY, "rdfs");
    assert(rewrittenQuery.includes("Animal"), "LivingThing still expands to Animal");
    assert(rewrittenQuery.includes("Dog"), "LivingThing still expands to Dog");

    let parseable = false;
    try {
      parser.parse(rewrittenQuery);
      parseable = true;
    } catch (e) {
      console.error(`    Error: ${e.message}`);
    }
    assert(parseable, "LivingThing expansion is valid SPARQL");
  }
}

// ---------------------------------------------------------------------------
// Deterministic skolemization (same blank node gets same IRI within one parse)
// ---------------------------------------------------------------------------

function testSkolemConsistency() {
  console.log("\n=== Skolemization consistency ===");

  // Two separate OntologyIndex instances should each be internally consistent,
  // but may have different UUIDs from each other
  {
    const idx1 = new OntologyIndex(BNODE_ONTOLOGY);
    const idx2 = new OntologyIndex(BNODE_ONTOLOGY);

    const WAS = "https://was-course.interactions.ics.unisg.ch/farm-ontology#";
    const sub1 = idx1.getAllSubClasses(`${WAS}ReadSoilMoistureAffordance`);
    const sub2 = idx2.getAllSubClasses(`${WAS}ReadSoilMoistureAffordance`);

    assert(sub1.size === sub2.size, "both indexes find same number of subclasses");
    assert(sub1.size > 0, "at least one skolemized subclass found");
  }
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

function run() {
  const start = Date.now();
  console.log("Testing blank node skolemization\n");

  testOntologyIndexBnodes();
  testRewriteWithBnodes();
  testMixedOntology();
  testBnodeSubclassChain();
  testSkolemConsistency();

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n=============================`);
  console.log(`Results: ${passed} passed, ${failed} failed (${elapsed}s)`);
  console.log(`=============================`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
