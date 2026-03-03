const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";

function namedNode(uri) {
  return { termType: "NamedNode", value: uri };
}

function cloneTerm(term) {
  return { ...term };
}

function cloneTriple(triple) {
  return {
    subject: cloneTerm(triple.subject),
    predicate: cloneTerm(triple.predicate),
    object: cloneTerm(triple.object),
  };
}

function isTypeTriple(triple) {
  return (
    triple.predicate.termType === "NamedNode" &&
    triple.predicate.value === RDF_TYPE &&
    triple.object.termType === "NamedNode"
  );
}

function hasConcreteProperty(triple) {
  return triple.predicate.termType === "NamedNode";
}

/**
 * Create a UNION AST node from an array of triple-pattern arrays.
 * Each element becomes a BGP branch in the UNION.
 */
function makeUnion(tripleSets) {
  return {
    type: "union",
    patterns: tripleSets.map((triples) => ({
      type: "bgp",
      triples,
    })),
  };
}

/**
 * Recursively walk all pattern containers in a SPARQL AST,
 * calling visitor(patternsArray) for each patterns array found.
 * The visitor may mutate the array in place (splice, push, etc.).
 */
function walkPatterns(patterns, visitor) {
  if (!Array.isArray(patterns)) return;
  visitor(patterns);

  for (const node of patterns) {
    if (!node) continue;

    if (node.type === "optional" || node.type === "group" || node.type === "minus" ||
        node.type === "graph" || node.type === "service") {
      walkPatterns(node.patterns, visitor);
    } else if (node.type === "union") {
      for (const branch of node.patterns) {
        if (Array.isArray(branch.patterns)) {
          walkPatterns(branch.patterns, visitor);
        }
      }
    } else if (node.type === "query" && node.where) {
      walkPatterns(node.where, visitor);
    } else if (node.type === "filter" && node.expression) {
      walkFilterExpression(node.expression, visitor);
    }
  }
}

function walkFilterExpression(expr, visitor) {
  if (!expr) return;
  if (expr.type === "operation" && (expr.operator === "exists" || expr.operator === "notexists")) {
    for (const arg of expr.args || []) {
      if (arg.type === "group" && Array.isArray(arg.patterns)) {
        walkPatterns(arg.patterns, visitor);
      }
    }
  }
  for (const arg of expr.args || []) {
    if (arg && typeof arg === "object" && arg.type === "operation") {
      walkFilterExpression(arg, visitor);
    }
  }
}

module.exports = {
  RDF_TYPE,
  namedNode,
  cloneTerm,
  cloneTriple,
  isTypeTriple,
  hasConcreteProperty,
  makeUnion,
  walkPatterns,
};
