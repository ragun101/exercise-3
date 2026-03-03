const { isTypeTriple, hasConcreteProperty, cloneTriple, makeUnion, walkPatterns } = require("./ast-utils");

/**
 * Rewrite triples using owl:SymmetricProperty declarations.
 * Adds UNION branch with subject/object swapped (same property).
 *
 * Example: if :knows a owl:SymmetricProperty, then
 *   ?x :knows ?y  =>  { ?x :knows ?y } UNION { ?y :knows ?x }
 */
function rewrite(ast, ontologyIndex) {
  walkPatterns(ast.where, (patterns) => {
    let i = 0;
    while (i < patterns.length) {
      const node = patterns[i];
      if (node.type !== "bgp") { i++; continue; }

      const expandIdx = node.triples.findIndex((t) => {
        if (!hasConcreteProperty(t) || isTypeTriple(t)) return false;
        return ontologyIndex.isSymmetric(t.predicate.value);
      });

      if (expandIdx === -1) { i++; continue; }

      const triple = node.triples[expandIdx];

      // Skip if subject and object are the same variable (?x :knows ?x)
      if (triple.subject.termType === "Variable" &&
          triple.object.termType === "Variable" &&
          triple.subject.value === triple.object.value) {
        i++;
        continue;
      }

      const swapped = {
        subject: cloneTriple(triple).object,
        predicate: cloneTriple(triple).predicate,
        object: cloneTriple(triple).subject,
      };
      const unionNode = makeUnion([[cloneTriple(triple)], [swapped]]);

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
