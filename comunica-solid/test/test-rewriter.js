/**
 * Unit tests for the query rewriter modules.
 * These run offline — no server or Solid pod needed.
 */
const path = require("path");
const { Parser, Generator } = require("sparqljs");
const { OntologyIndex } = require("../query-rewriter/ontology-index");
const { rewriteQuery } = require("../query-rewriter");
const rewriteSubclass = require("../query-rewriter/rewrite-subclass");
const rewriteSubproperty = require("../query-rewriter/rewrite-subproperty");
const rewriteInverse = require("../query-rewriter/rewrite-inverse");
const rewriteSymmetric = require("../query-rewriter/rewrite-symmetric");
const rewriteDomainRange = require("../query-rewriter/rewrite-domain-range");
const rewriteRestrictionClass = require("../query-rewriter/rewrite-restriction-class");
const rewriteSubclassOfProperty = require("../query-rewriter/rewrite-subclassof-property");

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

const EX = "http://example.org/test#";

const ONTOLOGY = `
  @prefix rdf:  <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
  @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
  @prefix owl:  <http://www.w3.org/2002/07/owl#> .
  @prefix ex:   <${EX}> .

  ex:Animal        rdfs:subClassOf  ex:LivingThing .
  ex:Dog           rdfs:subClassOf  ex:Animal .
  ex:hasPet        rdfs:range       ex:Animal .
  ex:friendlyName  rdfs:subPropertyOf rdfs:label .

  ex:Cat           owl:equivalentClass  ex:Feline .
  ex:likes         a owl:TransitiveProperty .
  ex:hasFriend     owl:equivalentProperty ex:friendWith .

  ex:knows         a owl:SymmetricProperty .
  ex:ownedBy       owl:inverseOf    ex:hasPet .
  ex:alice         owl:sameAs       ex:aliceAlt .

  # Restriction-based class: SpecialAction is anything that is a
  # ex:BaseAction with ex:hasInput whose ex:mediaType is "text/html"
  # and ex:hasOutput whose ex:mediaType is "application/json"
  ex:SpecialAction a owl:Class .
  [ a owl:Class ;
    owl:intersectionOf (
      ex:BaseAction
      [ a owl:Restriction ;
        owl:onProperty ex:hasInput ;
        owl:someValuesFrom [ a owl:Restriction ;
          owl:onProperty ex:mediaType ;
          owl:hasValue "text/html" ] ]
      [ a owl:Restriction ;
        owl:onProperty ex:hasOutput ;
        owl:someValuesFrom [ a owl:Restriction ;
          owl:onProperty ex:mediaType ;
          owl:hasValue "application/json" ] ]
    )
  ] rdfs:subClassOf ex:SpecialAction .
`;

// ---------------------------------------------------------------------------
// OntologyIndex tests
// ---------------------------------------------------------------------------

function testOntologyIndex() {
  console.log("\n=== OntologyIndex ===");
  const idx = new OntologyIndex(ONTOLOGY);

  // subClassOf
  const subAnimal = idx.getAllSubClasses(`${EX}Animal`);
  assert(subAnimal.has(`${EX}Dog`), "Dog is a subclass of Animal");
  assert(!subAnimal.has(`${EX}Cat`), "Cat is NOT a subclass of Animal");

  const subLiving = idx.getAllSubClasses(`${EX}LivingThing`);
  assert(subLiving.has(`${EX}Animal`), "Animal is a subclass of LivingThing");
  assert(subLiving.has(`${EX}Dog`), "Dog is transitively a subclass of LivingThing");

  // equivalentClass folded into subClassOf
  const subCat = idx.getAllSubClasses(`${EX}Cat`);
  assert(subCat.has(`${EX}Feline`), "Feline is a 'subclass' of Cat (via equivalentClass)");
  const subFeline = idx.getAllSubClasses(`${EX}Feline`);
  assert(subFeline.has(`${EX}Cat`), "Cat is a 'subclass' of Feline (via equivalentClass)");

  // subPropertyOf
  const subLabel = idx.getAllSubProperties("http://www.w3.org/2000/01/rdf-schema#label");
  assert(subLabel.has(`${EX}friendlyName`), "friendlyName is a subProperty of rdfs:label");

  // equivalentProperty folded into subPropertyOf
  const subHasFriend = idx.getAllSubProperties(`${EX}hasFriend`);
  assert(subHasFriend.has(`${EX}friendWith`), "friendWith is a 'subProperty' of hasFriend (via equivalentProperty)");
  const subFriendWith = idx.getAllSubProperties(`${EX}friendWith`);
  assert(subFriendWith.has(`${EX}hasFriend`), "hasFriend is a 'subProperty' of friendWith (via equivalentProperty)");

  // inverseOf
  const invOwnedBy = idx.getInverseProperties(`${EX}ownedBy`);
  assert(invOwnedBy.has(`${EX}hasPet`), "hasPet is inverse of ownedBy");
  const invHasPet = idx.getInverseProperties(`${EX}hasPet`);
  assert(invHasPet.has(`${EX}ownedBy`), "ownedBy is inverse of hasPet");

  // symmetricProperty
  assert(idx.isSymmetric(`${EX}knows`), "knows is symmetric");
  assert(!idx.isSymmetric(`${EX}likes`), "likes is NOT symmetric");

  // domain/range
  const rangeAnimal = idx.getPropertiesWithRange(`${EX}Animal`);
  assert(rangeAnimal.has(`${EX}hasPet`), "hasPet has range Animal");
}

// ---------------------------------------------------------------------------
// Subclass rewrite tests
// ---------------------------------------------------------------------------

function testRewriteSubclass() {
  console.log("\n=== rewrite-subclass ===");
  const idx = new OntologyIndex(ONTOLOGY);

  // Simple subclass expansion
  {
    const ast = parser.parse(`PREFIX ex: <${EX}> SELECT ?x WHERE { ?x a ex:Animal }`);
    rewriteSubclass.rewrite(ast, idx);
    const result = generator.stringify(ast);
    assert(result.includes("Animal"), "rewritten query still mentions Animal");
    assert(result.includes("Dog"), "rewritten query includes Dog subclass");
    assert(result.includes("UNION"), "rewritten query uses UNION");
  }

  // Transitive chain: LivingThing -> Animal -> Dog
  {
    const ast = parser.parse(`PREFIX ex: <${EX}> SELECT ?x WHERE { ?x a ex:LivingThing }`);
    rewriteSubclass.rewrite(ast, idx);
    const result = generator.stringify(ast);
    assert(result.includes("LivingThing"), "includes LivingThing");
    assert(result.includes("Animal"), "includes Animal (subclass)");
    assert(result.includes("Dog"), "includes Dog (transitive subclass)");
  }

  // No expansion for unknown class
  {
    const ast = parser.parse(`PREFIX ex: <${EX}> SELECT ?x WHERE { ?x a ex:UnknownClass }`);
    rewriteSubclass.rewrite(ast, idx);
    const result = generator.stringify(ast);
    assert(!result.includes("UNION"), "no UNION for unknown class");
  }

  // Multi-triple BGP: only type triple is expanded, other triple preserved
  {
    const ast = parser.parse(`PREFIX ex: <${EX}> SELECT ?x ?n WHERE { ?x a ex:Animal . ?x ex:name ?n }`);
    rewriteSubclass.rewrite(ast, idx);
    const result = generator.stringify(ast);
    assert(result.includes("UNION"), "UNION created for type pattern");
    assert(result.includes("name"), "name triple preserved");
  }

  // equivalentClass: Feline should expand to include Cat
  {
    const ast = parser.parse(`PREFIX ex: <${EX}> SELECT ?x WHERE { ?x a ex:Feline }`);
    rewriteSubclass.rewrite(ast, idx);
    const result = generator.stringify(ast);
    assert(result.includes("Cat"), "Feline expands to include Cat via equivalentClass");
  }
}

// ---------------------------------------------------------------------------
// Subproperty rewrite tests
// ---------------------------------------------------------------------------

function testRewriteSubproperty() {
  console.log("\n=== rewrite-subproperty ===");
  const idx = new OntologyIndex(ONTOLOGY);

  // rdfs:label has subProperty friendlyName
  {
    const ast = parser.parse(`
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      PREFIX ex: <${EX}>
      SELECT ?lbl WHERE { ex:fido rdfs:label ?lbl }
    `);
    rewriteSubproperty.rewrite(ast, idx);
    const result = generator.stringify(ast);
    assert(result.includes("UNION"), "UNION created for subPropertyOf");
    assert(result.includes("friendlyName"), "includes friendlyName sub-property");
  }

  // equivalentProperty: hasFriend <-> friendWith
  {
    const ast = parser.parse(`PREFIX ex: <${EX}> SELECT ?who WHERE { ex:alice ex:friendWith ?who }`);
    rewriteSubproperty.rewrite(ast, idx);
    const result = generator.stringify(ast);
    assert(result.includes("hasFriend"), "friendWith expands to include hasFriend via equivalentProperty");
  }

  // No expansion for property without sub-properties
  {
    const ast = parser.parse(`PREFIX ex: <${EX}> SELECT ?x WHERE { ?x ex:unknownProp ?y }`);
    rewriteSubproperty.rewrite(ast, idx);
    const result = generator.stringify(ast);
    assert(!result.includes("UNION"), "no UNION for property without sub-properties");
  }
}

// ---------------------------------------------------------------------------
// InverseOf rewrite tests
// ---------------------------------------------------------------------------

function testRewriteInverse() {
  console.log("\n=== rewrite-inverse ===");
  const idx = new OntologyIndex(ONTOLOGY);

  // ownedBy is inverse of hasPet: ?x :ownedBy ?y -> UNION with ?y :hasPet ?x
  {
    const ast = parser.parse(`PREFIX ex: <${EX}> SELECT ?owner WHERE { ex:fido ex:ownedBy ?owner }`);
    rewriteInverse.rewrite(ast, idx);
    const result = generator.stringify(ast);
    assert(result.includes("UNION"), "UNION created for inverseOf");
    assert(result.includes("hasPet"), "includes hasPet inverse");
  }

  // Bidirectional: hasPet -> ownedBy
  {
    const ast = parser.parse(`PREFIX ex: <${EX}> SELECT ?pet WHERE { ex:alice ex:hasPet ?pet }`);
    rewriteInverse.rewrite(ast, idx);
    const result = generator.stringify(ast);
    assert(result.includes("UNION"), "UNION created for hasPet->ownedBy");
    assert(result.includes("ownedBy"), "includes ownedBy inverse");
  }
}

// ---------------------------------------------------------------------------
// Symmetric rewrite tests
// ---------------------------------------------------------------------------

function testRewriteSymmetric() {
  console.log("\n=== rewrite-symmetric ===");
  const idx = new OntologyIndex(ONTOLOGY);

  // :knows is symmetric: ?x :knows ?y -> UNION with ?y :knows ?x
  {
    const ast = parser.parse(`PREFIX ex: <${EX}> SELECT ?who WHERE { ex:eve ex:knows ?who }`);
    rewriteSymmetric.rewrite(ast, idx);
    const result = generator.stringify(ast);
    assert(result.includes("UNION"), "UNION created for symmetric property");
    // The rewritten query should have two branches with knows
    const knowsCount = (result.match(/knows/g) || []).length;
    assert(knowsCount >= 2, "knows appears in both UNION branches");
  }

  // Non-symmetric property: no UNION
  {
    const ast = parser.parse(`PREFIX ex: <${EX}> SELECT ?who WHERE { ex:alice ex:likes ?who }`);
    rewriteSymmetric.rewrite(ast, idx);
    const result = generator.stringify(ast);
    assert(!result.includes("UNION"), "no UNION for non-symmetric property");
  }
}

// ---------------------------------------------------------------------------
// Domain/Range rewrite tests
// ---------------------------------------------------------------------------

function testRewriteDomainRange() {
  console.log("\n=== rewrite-domain-range ===");
  const idx = new OntologyIndex(ONTOLOGY);

  // hasPet has range Animal, so ?x a Animal can also be found via ?__rw :hasPet ?x
  {
    const ast = parser.parse(`PREFIX ex: <${EX}> SELECT ?x WHERE { ?x a ex:Animal }`);
    rewriteDomainRange.rewrite(ast, idx);
    const result = generator.stringify(ast);
    assert(result.includes("UNION"), "UNION created for range inference");
    assert(result.includes("hasPet"), "includes hasPet (range is Animal)");
  }
}

// ---------------------------------------------------------------------------
// Restriction class rewrite tests
// ---------------------------------------------------------------------------

function testRewriteRestrictionClass() {
  console.log("\n=== rewrite-restriction-class ===");
  const idx = new OntologyIndex(ONTOLOGY);

  // OntologyIndex: getRestrictionClassDef returns conditions for SpecialAction
  {
    const def = idx.getRestrictionClassDef(`${EX}SpecialAction`);
    assert(def !== null, "getRestrictionClassDef returns conditions for SpecialAction");
    assert(def.length === 3, `SpecialAction has 3 conditions (got ${def ? def.length : 0})`);
    const classCond = def.find((c) => c.type === "class");
    assert(classCond && classCond.classUri === `${EX}BaseAction`, "first condition is class BaseAction");
    const inputCond = def.find((c) => c.property === `${EX}hasInput`);
    assert(inputCond && inputCond.hasValue === "text/html", "input restriction has hasValue text/html");
    const outputCond = def.find((c) => c.property === `${EX}hasOutput`);
    assert(outputCond && outputCond.hasValue === "application/json", "output restriction has hasValue application/json");
  }

  // OntologyIndex: returns null for class without restriction definition
  {
    const def = idx.getRestrictionClassDef(`${EX}UnknownClass`);
    assert(def === null, "getRestrictionClassDef returns null for unknown class");
  }

  // Rewriter: expands ?x a ex:SpecialAction into structural pattern
  {
    const ast = parser.parse(`PREFIX ex: <${EX}> SELECT ?x WHERE { ?x a ex:SpecialAction }`);
    rewriteRestrictionClass.rewrite(ast, idx);
    const result = generator.stringify(ast);
    assert(result.includes("BaseAction"), "rewritten query includes BaseAction type check");
    assert(result.includes("hasInput"), "rewritten query includes hasInput property");
    assert(result.includes("hasOutput"), "rewritten query includes hasOutput property");
    assert(result.includes("mediaType"), "rewritten query includes mediaType property");
    assert(result.includes("text/html"), "rewritten query includes text/html value");
    assert(result.includes("application/json"), "rewritten query includes application/json value");
    assert(!result.includes("SpecialAction"), "original SpecialAction type triple is replaced");
  }

  // Rewriter: no expansion for class without restriction definition
  {
    const ast = parser.parse(`PREFIX ex: <${EX}> SELECT ?x WHERE { ?x a ex:Animal }`);
    rewriteRestrictionClass.rewrite(ast, idx);
    const result = generator.stringify(ast);
    assert(result.includes("Animal"), "Animal preserved (no restriction def)");
    assert(!result.includes("BaseAction"), "no BaseAction injected for Animal");
  }

  // Rewriter: produces valid SPARQL
  {
    const ast = parser.parse(`PREFIX ex: <${EX}> SELECT ?x WHERE { ?x a ex:SpecialAction }`);
    rewriteRestrictionClass.rewrite(ast, idx);
    const result = generator.stringify(ast);
    try {
      parser.parse(result);
      assert(true, "rewritten query is valid SPARQL (round-trip)");
    } catch (e) {
      assert(false, `rewritten query is NOT valid SPARQL: ${e.message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Full pipeline tests (rewriteQuery)
// ---------------------------------------------------------------------------

function testFullPipeline() {
  console.log("\n=== Full pipeline (rewriteQuery) ===");

  // RDFS: subclass + subproperty + domain/range
  {
    const { rewrittenQuery } = rewriteQuery(
      `PREFIX ex: <${EX}> SELECT ?x WHERE { ?x a ex:Animal }`,
      ONTOLOGY,
      "rdfs"
    );
    assert(rewrittenQuery.includes("Dog"), "[rdfs] Animal expanded to include Dog");
    assert(rewrittenQuery.includes("UNION"), "[rdfs] uses UNION");
  }

  // OWL-RL: adds inverse + symmetric
  {
    const { rewrittenQuery } = rewriteQuery(
      `PREFIX ex: <${EX}> SELECT ?owner WHERE { ex:fido ex:ownedBy ?owner }`,
      ONTOLOGY,
      "owl-rl"
    );
    assert(rewrittenQuery.includes("hasPet"), "[owl-rl] ownedBy expanded with hasPet inverse");
  }

  {
    const { rewrittenQuery } = rewriteQuery(
      `PREFIX ex: <${EX}> SELECT ?who WHERE { ex:eve ex:knows ?who }`,
      ONTOLOGY,
      "owl-rl"
    );
    assert(rewrittenQuery.includes("UNION"), "[owl-rl] symmetric property creates UNION");
  }

  // RDFS: inverse/symmetric should NOT be applied
  {
    const { rewrittenQuery } = rewriteQuery(
      `PREFIX ex: <${EX}> SELECT ?owner WHERE { ex:fido ex:ownedBy ?owner }`,
      ONTOLOGY,
      "rdfs"
    );
    assert(!rewrittenQuery.includes("hasPet"), "[rdfs] inverseOf NOT applied (needs owl-rl)");
  }

  // Round-trip: rewritten query should be valid SPARQL
  {
    const { rewrittenQuery } = rewriteQuery(
      `PREFIX ex: <${EX}> SELECT ?x ?n WHERE { ?x a ex:LivingThing . ?x ex:name ?n }`,
      ONTOLOGY,
      "rdfs"
    );
    try {
      parser.parse(rewrittenQuery);
      assert(true, "rewritten query is valid SPARQL (round-trip)");
    } catch (e) {
      assert(false, `rewritten query is NOT valid SPARQL: ${e.message}`);
    }
  }

  // Empty ontology: no rewrites, original query preserved
  {
    const emptyOntology = `@prefix ex: <${EX}> .`;
    const { rewrittenQuery } = rewriteQuery(
      `PREFIX ex: <${EX}> SELECT ?x WHERE { ?x a ex:Animal }`,
      emptyOntology,
      "rdfs"
    );
    assert(!rewrittenQuery.includes("UNION"), "empty ontology: no UNION expansion");
  }

  // OWL-RL: restriction class expansion for SpecialAction
  {
    const { rewrittenQuery } = rewriteQuery(
      `PREFIX ex: <${EX}> SELECT ?x WHERE { ?x a ex:SpecialAction }`,
      ONTOLOGY,
      "owl-rl"
    );
    assert(rewrittenQuery.includes("BaseAction"), "[owl-rl] SpecialAction expanded to BaseAction");
    assert(rewrittenQuery.includes("hasInput"), "[owl-rl] SpecialAction expanded with hasInput");
    assert(rewrittenQuery.includes("text/html"), "[owl-rl] SpecialAction expanded with text/html");
  }

  // RDFS: restriction class should NOT be expanded
  {
    const { rewrittenQuery } = rewriteQuery(
      `PREFIX ex: <${EX}> SELECT ?x WHERE { ?x a ex:SpecialAction }`,
      ONTOLOGY,
      "rdfs"
    );
    assert(!rewrittenQuery.includes("BaseAction"), "[rdfs] restriction class NOT expanded (needs owl-rl)");
  }
}

// ---------------------------------------------------------------------------
// Workflow ontology tests (using real TBox)
// ---------------------------------------------------------------------------

const fs = require("fs");

const WORKFLOW_TBOX = fs.readFileSync(
  path.join(__dirname, "..", "..", "SAMOD", "workflow-domain", "tbox.ttl"),
  "utf8"
);

const WORKFLOW = "https://purl.org/workflow/ontology#";
const TD = "https://www.w3.org/2019/wot/td#";
const PPLAN = "http://purl.org/net/p-plan#";

function testWorkflowOntology() {
  console.log("\n=== Workflow ontology (OntologyIndex) ===");
  const idx = new OntologyIndex(WORKFLOW_TBOX);

  // Workflow has a restriction def that yields class-only Plan (allValuesFrom is skipped)
  {
    const def = idx.getRestrictionClassDef(`${WORKFLOW}Workflow`);
    assert(def !== null, "Workflow has restriction class def");
    assert(def.length === 1, `Workflow def has 1 condition (got ${def ? def.length : 0})`);
    assert(def[0].type === "class" && def[0].classUri === `${PPLAN}Plan`,
      "Workflow expands to Plan");
  }

  // ToolAction has a unionOf def with two branches
  {
    const def = idx.getUnionClassDef(`${WORKFLOW}ToolAction`);
    assert(def !== null, "ToolAction has union class def");
    assert(def.length === 2, `ToolAction union has 2 branches (got ${def ? def.length : 0})`);

    const branch1Class = def[0].find((c) => c.type === "class");
    assert(branch1Class && branch1Class.classUri === `${TD}ActionAffordance`,
      "ToolAction branch 1 class is ActionAffordance");

    const branch2Class = def[1].find((c) => c.type === "class");
    assert(branch2Class && branch2Class.classUri === `${WORKFLOW}Workflow`,
      "ToolAction branch 2 class is Workflow");

    const branch1Input = def[0].find((c) => c.property === `${TD}hasInputSchema`);
    assert(branch1Input && branch1Input.type === "someValuesFrom",
      "ToolAction branch 1 has someValuesFrom on hasInputSchema");
  }

  // WebFetchAction has a restriction def with ToolAction class + nested someValuesFrom
  {
    const def = idx.getRestrictionClassDef(`${WORKFLOW}WebFetchAction`);
    assert(def !== null, "WebFetchAction has restriction class def");
    assert(def.length === 3, `WebFetchAction def has 3 conditions (got ${def ? def.length : 0})`);

    const classCond = def.find((c) => c.type === "class");
    assert(classCond && classCond.classUri === `${WORKFLOW}ToolAction`,
      "WebFetchAction class condition is ToolAction");

    const inputCond = def.find((c) => c.property === `${TD}hasInputSchema`);
    assert(inputCond && inputCond.hasValue === "text/uri-list",
      "WebFetchAction input has hasValue text/uri-list");

    const outputCond = def.find((c) => c.property === `${TD}hasOutputSchema`);
    assert(outputCond && outputCond.hasValue === "text/html",
      "WebFetchAction output has hasValue text/html");
  }

  // Anonymous class expressions are correctly identified
  {
    const subs = [...idx.getAllSubClasses(`${WORKFLOW}ToolAction`)];
    const namedSubs = subs.filter((c) => !idx.isAnonymousClassExpression(c));
    assert(namedSubs.length === 0,
      "ToolAction has no named (non-anonymous) subclasses");
  }
}

function testWorkflowRewriting() {
  console.log("\n=== Workflow ontology (rewriting) ===");

  // Workflow query: ?workflow a Workflow -> ?workflow a Plan
  {
    const { rewrittenQuery } = rewriteQuery(
      `PREFIX workflow: <${WORKFLOW}> PREFIX p-plan: <${PPLAN}>
       SELECT ?workflow ?step WHERE {
         ?workflow a workflow:Workflow .
         ?step p-plan:isStepOfPlan ?workflow .
       }`,
      WORKFLOW_TBOX,
      "owl-rl"
    );
    assert(rewrittenQuery.includes("Plan"),
      "Workflow expanded to Plan");
    assert(!rewrittenQuery.includes("Workflow"),
      "original Workflow type removed");
    assert(rewrittenQuery.includes("isStepOfPlan"),
      "isStepOfPlan pattern preserved");
  }

  // ToolAction query: expands to UNION with ActionAffordance and Workflow branches
  {
    const { rewrittenQuery } = rewriteQuery(
      `PREFIX workflow: <${WORKFLOW}> SELECT ?action WHERE { ?action a workflow:ToolAction }`,
      WORKFLOW_TBOX,
      "owl-rl"
    );
    assert(rewrittenQuery.includes("UNION"),
      "ToolAction produces UNION");
    assert(rewrittenQuery.includes("ActionAffordance"),
      "ToolAction UNION includes ActionAffordance branch");
    assert(rewrittenQuery.includes("Plan"),
      "ToolAction UNION includes Workflow->Plan branch");
    assert(rewrittenQuery.includes("hasInputSchema"),
      "ToolAction UNION includes hasInputSchema");
    assert(rewrittenQuery.includes("hasOutputSchema"),
      "ToolAction UNION includes hasOutputSchema");
  }

  // WebFetchAction query: recursive expansion through ToolAction union
  {
    const { rewrittenQuery } = rewriteQuery(
      `PREFIX workflow: <${WORKFLOW}> SELECT ?action WHERE { ?action a workflow:WebFetchAction }`,
      WORKFLOW_TBOX,
      "owl-rl"
    );
    assert(rewrittenQuery.includes("UNION"),
      "WebFetchAction produces UNION");
    assert(rewrittenQuery.includes("ActionAffordance"),
      "WebFetchAction recursively includes ActionAffordance");
    assert(rewrittenQuery.includes("text/uri-list"),
      "WebFetchAction includes input media type text/uri-list");
    assert(rewrittenQuery.includes("text/html"),
      "WebFetchAction includes output media type text/html");
    assert(!rewrittenQuery.includes("WebFetchAction"),
      "original WebFetchAction type removed");
  }

  // Rewritten Workflow query is valid SPARQL
  {
    const { rewrittenQuery } = rewriteQuery(
      `PREFIX workflow: <${WORKFLOW}> PREFIX p-plan: <${PPLAN}>
       SELECT ?workflow ?step WHERE {
         ?workflow a workflow:Workflow .
         ?step p-plan:isStepOfPlan ?workflow .
       }`,
      WORKFLOW_TBOX,
      "owl-rl"
    );
    try {
      parser.parse(rewrittenQuery);
      assert(true, "rewritten Workflow query is valid SPARQL");
    } catch (e) {
      assert(false, `rewritten Workflow query is NOT valid SPARQL: ${e.message}`);
    }
  }

  // Rewritten WebFetchAction query is valid SPARQL
  {
    const { rewrittenQuery } = rewriteQuery(
      `PREFIX workflow: <${WORKFLOW}> SELECT ?action WHERE { ?action a workflow:WebFetchAction }`,
      WORKFLOW_TBOX,
      "owl-rl"
    );
    try {
      parser.parse(rewrittenQuery);
      assert(true, "rewritten WebFetchAction query is valid SPARQL");
    } catch (e) {
      assert(false, `rewritten WebFetchAction query is NOT valid SPARQL: ${e.message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// SubClassOf property rewrite tests (rdfs:subClassOf as a predicate)
// ---------------------------------------------------------------------------

function testRewriteSubclassOfProperty() {
  console.log("\n=== rewrite-subclassof-property ===");
  const idx = new OntologyIndex(WORKFLOW_TBOX);

  // getNamedSubClassesOfClass finds WebFetchAction as subclass of ToolAction
  {
    const subs = idx.getNamedSubClassesOfClass(`${WORKFLOW}ToolAction`);
    assert(subs.has(`${WORKFLOW}WebFetchAction`),
      "WebFetchAction is a named subclass of ToolAction");
  }

  // Rewriter: ?action rdfs:subClassOf workflow:ToolAction -> VALUES with named subclasses
  {
    const ast = parser.parse(
      `PREFIX workflow: <${WORKFLOW}> PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
       SELECT ?action WHERE { ?action rdfs:subClassOf workflow:ToolAction }`
    );
    rewriteSubclassOfProperty.rewrite(ast, idx);
    const result = generator.stringify(ast);
    assert(result.includes("WebFetchAction"),
      "rewritten query includes WebFetchAction");
    assert(result.includes("VALUES"),
      "rewritten query uses VALUES clause");
    assert(!result.includes("subClassOf"),
      "original subClassOf pattern is replaced");
  }

  // Full pipeline: q6 query with rdfs:comment
  {
    const { rewrittenQuery } = rewriteQuery(
      `PREFIX workflow: <${WORKFLOW}> PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
       SELECT ?action ?comment WHERE {
         ?action rdfs:subClassOf workflow:ToolAction .
         ?action rdfs:comment ?comment .
       }`,
      WORKFLOW_TBOX,
      "owl-rl"
    );
    assert(rewrittenQuery.includes("WebFetchAction"),
      "[pipeline] q6 query includes WebFetchAction");
    assert(rewrittenQuery.includes("VALUES"),
      "[pipeline] q6 query uses VALUES");
    assert(rewrittenQuery.includes("comment"),
      "[pipeline] q6 query preserves rdfs:comment pattern");
  }

  // Rewritten query is valid SPARQL
  {
    const { rewrittenQuery } = rewriteQuery(
      `PREFIX workflow: <${WORKFLOW}> PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
       SELECT ?action ?comment WHERE {
         ?action rdfs:subClassOf workflow:ToolAction .
         ?action rdfs:comment ?comment .
       }`,
      WORKFLOW_TBOX,
      "owl-rl"
    );
    try {
      parser.parse(rewrittenQuery);
      assert(true, "rewritten q6 query is valid SPARQL");
    } catch (e) {
      assert(false, `rewritten q6 query is NOT valid SPARQL: ${e.message}`);
    }
  }

  // No expansion for class with no named subclasses
  {
    const ast = parser.parse(
      `PREFIX workflow: <${WORKFLOW}> PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
       SELECT ?x WHERE { ?x rdfs:subClassOf workflow:WebFetchAction }`
    );
    rewriteSubclassOfProperty.rewrite(ast, idx);
    const result = generator.stringify(ast);
    assert(!result.includes("VALUES"),
      "no VALUES for class with no named subclasses");
    assert(result.includes("subClassOf"),
      "original subClassOf pattern preserved when no expansion");
  }
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

function run() {
  const start = Date.now();
  console.log("Testing query rewriter modules\n");

  testOntologyIndex();
  testRewriteSubclass();
  testRewriteSubproperty();
  testRewriteInverse();
  testRewriteSymmetric();
  testRewriteDomainRange();
  testRewriteRestrictionClass();
  testFullPipeline();
  testWorkflowOntology();
  testWorkflowRewriting();
  testRewriteSubclassOfProperty();

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n=============================`);
  console.log(`Results: ${passed} passed, ${failed} failed (${elapsed}s)`);
  console.log(`=============================`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
