const { isTypeTriple, hasConcreteProperty, cloneTriple, namedNode, makeUnion, walkPatterns } = require("./ast-utils");

/**
 * Rewrite ?s :prop ?o patterns to UNION with all known sub-properties.
 * Skips rdf:type triples (handled by rewrite-subclass).
 *
 * Example: if friendlyName subPropertyOf rdfs:label, then
 *   ?s rdfs:label ?o  =>  { ?s rdfs:label ?o } UNION { ?s :friendlyName ?o }
 */
function rewrite(ast, ontologyIndex) {
  walkPatterns(ast.where, (patterns) => {
    let i = 0;
    while (i < patterns.length) {
      const node = patterns[i];
      if (node.type !== "bgp") { i++; continue; }

      const expandIdx = node.triples.findIndex((t) => {
        if (!hasConcreteProperty(t) || isTypeTriple(t)) return false;
        return ontologyIndex.getAllSubProperties(t.predicate.value).size > 0;
      });

      if (expandIdx === -1) { i++; continue; }

      const triple = node.triples[expandIdx];
      const subProps = ontologyIndex.getAllSubProperties(triple.predicate.value);

      const branches = [triple.predicate.value, ...subProps].map((prop) => {
        const t = cloneTriple(triple);
        t.predicate = namedNode(prop);
        return [t];
      });
      const unionNode = makeUnion(branches);

      node.triples.splice(expandIdx, 1);
      if (node.triples.length === 0) {
        patterns.splice(i, 1, unionNode);
      } else {
        patterns.splice(i, 0, unionNode);
        i++;
      }
    }
  });
}

module.exports = { rewrite };
