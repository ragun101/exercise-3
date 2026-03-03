const { namedNode, makeUnion, walkPatterns } = require("./ast-utils");

const RDFS_SUBCLASSOF = "http://www.w3.org/2000/01/rdf-schema#subClassOf";

/**
 * Detect a triple pattern of the form: ?x rdfs:subClassOf :Class
 */
function isSubClassOfTriple(triple) {
  return (
    triple.predicate.termType === "NamedNode" &&
    triple.predicate.value === RDFS_SUBCLASSOF &&
    triple.object.termType === "NamedNode"
  );
}

/**
 * Rewrite ?x rdfs:subClassOf :Class patterns by expanding with all named
 * classes that are structurally defined as subclasses of :Class in the ontology.
 *
 * Example: if WebFetchAction is defined via
 *   [ intersectionOf(ToolAction, ...) ] rdfs:subClassOf WebFetchAction
 * then ?x rdfs:subClassOf ToolAction expands to include WebFetchAction.
 *
 * This produces a VALUES clause binding the subject variable to the known
 * named subclasses, replacing the rdfs:subClassOf triple pattern entirely.
 */
function rewrite(ast, ontologyIndex) {
  walkPatterns(ast.where, (patterns) => {
    let i = 0;
    while (i < patterns.length) {
      const node = patterns[i];
      if (node.type !== "bgp") { i++; continue; }

      const expandIdx = node.triples.findIndex((t) => {
        if (!isSubClassOfTriple(t)) return false;
        const namedSubs = ontologyIndex.getNamedSubClassesOfClass(t.object.value);
        return namedSubs.size > 0;
      });

      if (expandIdx === -1) { i++; continue; }

      const triple = node.triples[expandIdx];
      const subject = triple.subject;
      const parentClass = triple.object.value;
      const namedSubs = [...ontologyIndex.getNamedSubClassesOfClass(parentClass)];

      // If the subject is a variable, replace with a VALUES clause
      if (subject.termType === "Variable") {
        const valuesNode = {
          type: "values",
          values: namedSubs.map((cls) => ({
            [`?${subject.value}`]: namedNode(cls),
          })),
        };

        node.triples.splice(expandIdx, 1);
        if (node.triples.length === 0) {
          patterns.splice(i, 1, valuesNode);
        } else {
          patterns.splice(i, 0, valuesNode);
          i++;
        }
      } else {
        // Subject is a named node — check if it's one of the known subclasses
        // If so, keep as-is (it will match); if not, this pattern can't match
        i++;
      }
      continue;
    }
  });
}

module.exports = { rewrite };
