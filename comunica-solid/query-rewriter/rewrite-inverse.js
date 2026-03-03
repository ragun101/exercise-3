const { isTypeTriple, hasConcreteProperty, cloneTriple, namedNode, makeUnion, walkPatterns } = require("./ast-utils");

/**
 * Rewrite triples using properties with owl:inverseOf declarations.
 * Adds UNION branch with subject/object swapped and the inverse property.
 *
 * Example: if ownedBy inverseOf hasPet, then
 *   ?x :ownedBy ?y  =>  { ?x :ownedBy ?y } UNION { ?y :hasPet ?x }
 */
function rewrite(ast, ontologyIndex) {
  walkPatterns(ast.where, (patterns) => {
    let i = 0;
    while (i < patterns.length) {
      const node = patterns[i];
      if (node.type !== "bgp") { i++; continue; }

      const expandIdx = node.triples.findIndex((t) => {
        if (!hasConcreteProperty(t) || isTypeTriple(t)) return false;
        return ontologyIndex.getInverseProperties(t.predicate.value).size > 0;
      });

      if (expandIdx === -1) { i++; continue; }

      const triple = node.triples[expandIdx];
      const inverses = ontologyIndex.getInverseProperties(triple.predicate.value);

      const branches = [[cloneTriple(triple)]];
      for (const invProp of inverses) {
        branches.push([{
          subject: cloneTriple(triple).object,
          predicate: namedNode(invProp),
          object: cloneTriple(triple).subject,
        }]);
      }
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
