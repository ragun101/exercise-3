const { isTypeTriple, cloneTriple, namedNode, walkPatterns } = require("./ast-utils");

let varCounter = 0;

function freshVar() {
  return { termType: "Variable", value: `__rw_${varCounter++}` };
}

/**
 * Rewrite ?x a :Class patterns to add UNION branches for rdfs:domain and rdfs:range.
 *
 * If property :p has rdfs:domain :C, then anything using :p as a property is of type :C.
 * So ?x a :C can also be found via ?x :p ?__freshVar.
 *
 * If property :p has rdfs:range :C, then anything that is an object of :p is of type :C.
 * So ?x a :C can also be found via ?__freshVar :p ?x.
 */
function rewrite(ast, ontologyIndex) {
  varCounter = 0;

  walkPatterns(ast.where, (patterns) => {
    let i = 0;
    while (i < patterns.length) {
      const node = patterns[i];
      if (node.type !== "bgp") { i++; continue; }

      const expandIdx = node.triples.findIndex((t) => {
        if (!isTypeTriple(t)) return false;
        const classUri = t.object.value;
        return (
          ontologyIndex.getPropertiesWithDomain(classUri).size > 0 ||
          ontologyIndex.getPropertiesWithRange(classUri).size > 0
        );
      });

      if (expandIdx === -1) { i++; continue; }

      const triple = node.triples[expandIdx];
      const classUri = triple.object.value;
      const subject = triple.subject;

      const branches = [[cloneTriple(triple)]];

      // Domain: ?x :p ?__fresh  (because :p rdfs:domain :C means ?x is a :C)
      for (const prop of ontologyIndex.getPropertiesWithDomain(classUri)) {
        branches.push([{
          subject: { ...subject },
          predicate: namedNode(prop),
          object: freshVar(),
        }]);
      }

      // Range: ?__fresh :p ?x  (because :p rdfs:range :C means ?x is a :C)
      for (const prop of ontologyIndex.getPropertiesWithRange(classUri)) {
        branches.push([{
          subject: freshVar(),
          predicate: namedNode(prop),
          object: { ...subject },
        }]);
      }

      if (branches.length === 1) { i++; continue; }

      const unionNode = {
        type: "union",
        patterns: branches.map((triples) => ({
          type: "bgp",
          triples,
        })),
      };

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
