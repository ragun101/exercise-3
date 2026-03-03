const { QueryEngine } = require("@comunica/query-sparql-solid");
const { QueryEngine: QueryEngineLinkTraversal } = require("@comunica/query-sparql-link-traversal-solid");
const { Store, DataFactory } = require("n3");
const { applyReasoner } = require("./reasoners");
const { rewriteQuery } = require("./query-rewriter");
const { Parser: SparqlParser, Generator: SparqlGenerator } = require("sparqljs");

const DEBUG = process.env.DEBUG_HYBRID === "true";

let engine = null;
let queryEngine = null;

function initEngines() {
  engine = new QueryEngine();
  queryEngine = new QueryEngineLinkTraversal();
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
        if (term.termType === "Literal") {
          if (term.datatype) row[variable].datatype = term.datatype.value;
          if (term.language) row[variable]["xml:lang"] = term.language;
        }
      }
    }
    return row;
  });

  return {
    head: { vars: variables },
    results: { bindings: results },
  };
}

/**
 * Runs a SPARQL SELECT query directly against an engine.
 */
async function runSparql(eng, query, context) {
  const bindingsStream = await eng.queryBindings(query, context);
  const bindings = await bindingsStream.toArray();
  return bindingsToResult(bindings);
}

/**
 * Collect triple patterns from a single WHERE-clause node.
 * Only descends into BGPs — does NOT recurse into UNIONs (those are
 * handled as separate branches by the caller).
 */
function collectBgpTriples(patterns) {
  const triples = [];
  for (const node of patterns) {
    if (node.type === "bgp") {
      triples.push(...node.triples);
    } else if (node.type === "group" || node.type === "optional") {
      triples.push(...collectBgpTriples(node.patterns));
    }
  }
  return triples;
}

/**
 * Decompose a WHERE clause into individual branches.
 * Each branch is { patterns: [...], triples: [...] } where patterns
 * is a valid WHERE array for a SELECT, and triples are the BGP triple
 * patterns used to reconstruct quads from bindings.
 *
 * A top-level UNION is split into its branches; everything else
 * (BGPs, OPTIONALs, etc.) is kept together as one branch.
 */
function decomposeBranches(whereClause) {
  const unions = [];
  const nonUnion = [];

  for (const node of whereClause) {
    if (node.type === "union") {
      for (const alt of node.patterns) {
        const altPatterns = alt.type === "bgp" ? [alt] : (alt.patterns || [alt]);
        unions.push(altPatterns);
      }
    } else {
      nonUnion.push(node);
    }
  }

  // No UNION: single branch with all patterns
  if (unions.length === 0) {
    if (nonUnion.length === 0) return [];
    return [{
      patterns: nonUnion,
      triples: collectBgpTriples(nonUnion),
    }];
  }

  const branches = [];

  // Each UNION alternative is merged with the non-UNION patterns
  // to preserve joins across the UNION boundary
  for (const altPatterns of unions) {
    const combined = [...altPatterns, ...nonUnion];
    branches.push({
      patterns: combined,
      triples: collectBgpTriples(combined),
    });
  }

  // Also run the non-UNION patterns alone as a "base fetch" branch.
  // This discovers resources via link traversal that the restrictive
  // UNION branches may miss (e.g. tractors whose affordance type must
  // be inferred). The discovered URLs are then used for a full fetch
  // so the reasoner has complete data to work with.
  if (nonUnion.length > 0) {
    branches.push({
      patterns: nonUnion,
      triples: collectBgpTriples(nonUnion),
    });
  }

  return branches;
}

/**
 * Resolve a sparqljs AST term using a Comunica binding.
 * Variables are looked up in the binding; named nodes are returned as-is.
 * Property path predicates (e.g. prop+) are unwrapped to their base named node.
 */
function resolveTerm(term, binding) {
  if (term.termType === "Variable") {
    return binding.get(term.value) || null;
  }
  // Property path: { type: "path", pathType: "+", items: [namedNode] }
  if (term.type === "path" && term.items && term.items.length > 0) {
    return DataFactory.namedNode(term.items[0].value);
  }
  return DataFactory.namedNode(term.value);
}

/**
 * Hybrid query execution: rewrite + per-branch SELECT + materialize.
 *
 *  1. Rewrite the SPARQL query using ontology axioms (expands patterns
 *     into UNIONs for subClassOf, subPropertyOf, equivalentClass, etc.)
 *  2. Decompose the rewritten WHERE clause into individual branches
 *  3. Run each branch as a separate SELECT via link traversal
 *  4. Reconstruct quads from each branch's own triple patterns + bindings
 *  5. Load quads + ontology into an N3 Store, apply reasoner
 *  6. Re-execute the original SELECT against the enriched store
 */
async function runSparqlHybrid(eng, query, context, reasonerName, ontologyTurtle) {
  const { rewrittenQuery, ontologyIndex } = rewriteQuery(query, ontologyTurtle, reasonerName);

  const sparqlParser = new SparqlParser({ baseIRI: "http://example.org/.well-known/genid/" });
  const sparqlGenerator = new SparqlGenerator();
  const rewrittenAst = sparqlParser.parse(rewrittenQuery);
  const branches = decomposeBranches(rewrittenAst.where);

  if (DEBUG) {
    console.log("[hybrid] rewritten query:", rewrittenQuery);
    console.log("[hybrid] branches:", branches.length);
  }

  // Run each branch as a separate SELECT and reconstruct quads
  const store = new Store();
  const discoveredSources = new Set(context.sources || []);

  for (const branch of branches) {
    // Build a SELECT * query for this branch so all variable bindings
    // are available for quad reconstruction
    const branchAst = {
      ...rewrittenAst,
      variables: [{ termType: "Wildcard", value: "*" }],
      where: branch.patterns,
    };
    const branchQuery = sparqlGenerator.stringify(branchAst);

    if (DEBUG) {
      console.log("[hybrid] branch query:", branchQuery);
    }

    const bindingsStream = await eng.queryBindings(branchQuery, context);
    const bindings = await bindingsStream.toArray();

    if (DEBUG) {
      console.log("[hybrid] branch bindings:", bindings.length);
    }

    // Instantiate this branch's triple patterns with its own bindings
    // and collect discovered named node URIs as sources for full fetch
    for (const binding of bindings) {
      for (const tp of branch.triples) {
        const s = resolveTerm(tp.subject, binding);
        const p = resolveTerm(tp.predicate, binding);
        const o = resolveTerm(tp.object, binding);
        if (s && p && o) {
          store.addQuad(s, p, o);
          if (DEBUG) console.log("[hybrid] quad:", s.value, p.value, o.value);
        }
      }
      // Collect all NamedNode binding values as potential sources
      for (const [, term] of binding) {
        if (term.termType === "NamedNode") {
          discoveredSources.add(term.value);
        }
      }
    }
  }

  // Fetch all triples from discovered sources using the standard engine.
  // This retrieves full resource data (including properties like td:name
  // that aren't in the query patterns) so the reasoner can infer types.
  if (DEBUG) console.log("[hybrid] fetching from", discoveredSources.size, "sources");
  const fetchQuery = "SELECT ?s ?p ?o WHERE { ?s ?p ?o }";
  const fetchContext = {
    ...context,
    sources: [...discoveredSources],
  };
  await engine.invalidateHttpCache();
  const fetchStream = await engine.queryBindings(fetchQuery, fetchContext);
  const fetchBindings = await fetchStream.toArray();
  for (const b of fetchBindings) {
    const s = b.get("s");
    const p = b.get("p");
    const o = b.get("o");
    if (s && p && o) {
      store.addQuad(s, p, o);
    }
  }

  if (DEBUG) console.log("[hybrid] store size before reasoning:", store.size);

  // Add ontology triples and apply reasoner
  store.addQuads(ontologyIndex.store.getQuads());
  if (DEBUG) console.log("[hybrid] store size after ontology:", store.size);
  applyReasoner(reasonerName, store);
  if (DEBUG) console.log("[hybrid] store size after reasoning:", store.size);

  // Re-execute the rewritten query against the enriched store.
  // Using the rewritten query (instead of the original) ensures that
  // structural expansions (e.g. Workflow → Plan) can match inferred data
  // that the reasoner produced, even when the original class type itself
  // (e.g. workflow:Workflow) cannot be inferred due to OWL-RL limitations
  // like allValuesFrom + subClassOf.
  // Force DISTINCT to deduplicate results introduced by UNION expansion.
  const finalAst = sparqlParser.parse(rewrittenQuery);
  finalAst.distinct = true;
  const finalQuery = sparqlGenerator.stringify(finalAst);
  if (DEBUG) console.log("[hybrid] final query:", finalQuery);
  const resultStream = await engine.queryBindings(finalQuery, { sources: [store] });
  const resultBindings = await resultStream.toArray();
  return bindingsToResult(resultBindings);
}

/**
 * Executes a SPARQL SELECT query via the standard Comunica engine.
 */
async function executeSparql(query, context) {
  return runSparql(engine, query, context);
}

/**
 * Executes a SPARQL SELECT query via the link-traversal Comunica engine.
 * If a reasoner name is provided, reasoning is applied before querying.
 * If ontology Turtle is also provided, the hybrid pipeline is used.
 */
async function executeSparqlLinkTraversal(query, context, reasonerName, ontologyTurtle) {
  if (reasonerName && ontologyTurtle) {
    return runSparqlHybrid(queryEngine, query, context, reasonerName, ontologyTurtle);
  }
  return runSparql(queryEngine, query, context);
}

/**
 * Executes a SPARQL SELECT query via the standard (non-link-traversal) engine
 * against explicitly provided sources. Supports the same reasoning/hybrid
 * pipeline as link traversal.
 */
async function executeSparqlDirect(query, context, reasonerName, ontologyTurtle) {
  await engine.invalidateHttpCache();
  if (reasonerName && ontologyTurtle) {
    return runSparqlHybrid(engine, query, context, reasonerName, ontologyTurtle);
  }
  return runSparql(engine, query, context);
}

async function invalidateHttpCache(url) {
  await Promise.all([
    engine.invalidateHttpCache(url),
    queryEngine.invalidateHttpCache(url),
  ]);
}

module.exports = { initEngines, executeSparql, executeSparqlLinkTraversal, executeSparqlDirect, invalidateHttpCache };
