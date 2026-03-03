const { Parser, Generator } = require("sparqljs");
const { OntologyIndex } = require("./ontology-index");
const rewriteSubclass = require("./rewrite-subclass");
const rewriteSubproperty = require("./rewrite-subproperty");
const rewriteInverse = require("./rewrite-inverse");
const rewriteSymmetric = require("./rewrite-symmetric");
const rewriteTransitive = require("./rewrite-transitive");
const rewriteSameAs = require("./rewrite-sameas");
const rewriteDomainRange = require("./rewrite-domain-range");
const rewriteRestrictionClass = require("./rewrite-restriction-class");
const rewriteSubclassOfProperty = require("./rewrite-subclassof-property");

const parser = new Parser({ baseIRI: "http://example.org/.well-known/genid/" });
const generator = new Generator();

/**
 * Rewrite a SPARQL query using ontology axioms to expand patterns
 * for more comprehensive link-traversal coverage.
 *
 * @param {string} queryString     - The original SPARQL SELECT query
 * @param {string} ontologyTurtle  - The ontology as a Turtle string
 * @param {string} reasonerName    - "rdfs" or "owl-rl"
 * @returns {{ rewrittenQuery: string, ontologyIndex: OntologyIndex }}
 */
function rewriteQuery(queryString, ontologyTurtle, reasonerName) {
  const ast = parser.parse(queryString);
  const index = new OntologyIndex(ontologyTurtle);

  // OWL-RL: expand restriction-defined classes before subclass expansion,
  // so that ?x a :RestClass is replaced with structural triples before
  // rewrite-subclass tries to expand it with skolemized blank node subclasses.
  if (reasonerName === "owl-rl") {
    rewriteRestrictionClass.rewrite(ast, index);
  }

  // RDFS-level rewrites (all reasoners include RDFS)
  rewriteSubclass.rewrite(ast, index);
  rewriteSubproperty.rewrite(ast, index);
  rewriteDomainRange.rewrite(ast, index);

  // OWL-RL adds rdfs:subClassOf property pattern rewriting and transitive property paths
  if (reasonerName === "owl-rl") {
    rewriteSubclassOfProperty.rewrite(ast, index);
    rewriteTransitive.rewrite(ast, index);
  }

  // OWL-RL adds inverseOf, symmetric, and sameAs
  if (reasonerName === "owl-rl") {
    rewriteInverse.rewrite(ast, index);
    rewriteSymmetric.rewrite(ast, index);
    rewriteSameAs.rewrite(ast, index);
  }

  const rewrittenQuery = generator.stringify(ast);
  return { rewrittenQuery, ontologyIndex: index };
}

module.exports = { rewriteQuery, OntologyIndex };
