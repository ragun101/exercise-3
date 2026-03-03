const { isTypeTriple, hasConcreteProperty, walkPatterns } = require("./ast-utils");

/**
 * Rewrite triples using properties declared as owl:TransitiveProperty.
 * Replaces `?x prop ?y` with `?x prop+ ?y` (property path).
 *
 * This delegates transitive closure computation to the SPARQL engine
 * instead of materializing all transitive triples.
 */
function rewrite(ast, ontologyIndex) {
  walkPatterns(ast.where, (patterns) => {
    for (const node of patterns) {
      if (node.type !== "bgp") continue;

      for (const triple of node.triples) {
        if (!hasConcreteProperty(triple) || isTypeTriple(triple)) continue;
        if (!ontologyIndex.isTransitive(triple.predicate.value)) continue;

        // Replace plain predicate with a property path: pred+
        triple.predicate = {
          type: "path",
          pathType: "+",
          items: [triple.predicate],
        };
      }
    }
  });
}

module.exports = { rewrite };
