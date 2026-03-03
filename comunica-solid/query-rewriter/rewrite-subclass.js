const { isTypeTriple, cloneTriple, namedNode, makeUnion, walkPatterns } = require("./ast-utils");

/**
 * Rewrite ?x a :Class patterns to UNION with all known subclasses.
 *
 * Example: if Dog subClassOf Animal, then
 *   ?x a :Animal  =>  { ?x a :Animal } UNION { ?x a :Dog }
 */
function rewrite(ast, ontologyIndex) {
  walkPatterns(ast.where, (patterns) => {
    let i = 0;
    while (i < patterns.length) {
      const node = patterns[i];
      if (node.type !== "bgp") { i++; continue; }

      const expandIdx = node.triples.findIndex((t) => {
        if (!isTypeTriple(t)) return false;
        const realSubClasses = [...ontologyIndex.getAllSubClasses(t.object.value)]
          .filter((cls) => !ontologyIndex.isAnonymousClassExpression(cls));
        return realSubClasses.length > 0;
      });

      if (expandIdx === -1) { i++; continue; }

      const triple = node.triples[expandIdx];
      const subClasses = [...ontologyIndex.getAllSubClasses(triple.object.value)]
        .filter((cls) => !ontologyIndex.isAnonymousClassExpression(cls));

      // Build UNION branches: original class + each subclass
      const branches = [triple.object.value, ...subClasses].map((cls) => {
        const t = cloneTriple(triple);
        t.object = namedNode(cls);
        return [t];
      });
      const unionNode = makeUnion(branches);

      // Remove the triple from the BGP and splice in the UNION
      node.triples.splice(expandIdx, 1);
      if (node.triples.length === 0) {
        patterns.splice(i, 1, unionNode);
      } else {
        patterns.splice(i, 0, unionNode);
        i++; // skip past the UNION, re-check the BGP for more expandable triples
      }
    }
  });
}

module.exports = { rewrite };
