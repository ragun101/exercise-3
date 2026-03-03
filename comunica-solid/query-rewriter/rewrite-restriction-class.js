const { isTypeTriple, namedNode, makeUnion, walkPatterns } = require("./ast-utils");

let varCounter = 0;

function freshVar() {
  return { termType: "Variable", value: `__rc_${varCounter++}` };
}

const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";

/**
 * Build triples from an array of intersection conditions for a given subject.
 * When a class condition itself has a unionOf definition, extract only the
 * non-redundant class conditions from each union branch (the someValuesFrom
 * conditions in the union are subsumed by the parent intersection's more
 * specific conditions).
 */
function conditionsToTriples(subject, conditions, ontologyIndex) {
  const triples = [];
  for (const cond of conditions) {
    if (cond.type === "class") {
      // Check if this class has a restriction (intersectionOf) definition
      const nestedRestriction = ontologyIndex.getRestrictionClassDef(cond.classUri);
      if (nestedRestriction) {
        triples.push(...conditionsToTriples(subject, nestedRestriction, ontologyIndex));
        continue;
      }
      // Check if this class has a union definition — if so, extract the
      // class conditions from each branch (the structural conditions like
      // someValuesFrom are already covered by the parent intersection)
      const unionDef = ontologyIndex.getUnionClassDef(cond.classUri);
      if (unionDef) {
        const classesFromBranches = [];
        for (const branch of unionDef) {
          for (const bc of branch) {
            if (bc.type === "class") classesFromBranches.push(bc.classUri);
          }
        }
        // Deduplicate: if all branches share the same class, emit one triple
        const unique = [...new Set(classesFromBranches)];
        if (unique.length === 1) {
          triples.push({
            subject: { ...subject },
            predicate: namedNode(RDF_TYPE),
            object: namedNode(unique[0]),
          });
        } else if (unique.length > 1) {
          // Multiple distinct classes across branches — will be handled
          // at the pattern level by producing a UNION. Store as marker.
          triples.push({ _unionClasses: unique, subject });
        }
        continue;
      }
      // Plain named class: ?x a :Class
      triples.push({
        subject: { ...subject },
        predicate: namedNode(RDF_TYPE),
        object: namedNode(cond.classUri),
      });
    } else if (cond.type === "someValuesFrom" && cond.nestedProperty && cond.hasValue) {
      const intermediateVar = freshVar();
      triples.push({
        subject: { ...subject },
        predicate: namedNode(cond.property),
        object: intermediateVar,
      });
      triples.push({
        subject: { ...intermediateVar },
        predicate: namedNode(cond.nestedProperty),
        object: { termType: "Literal", value: cond.hasValue },
      });
    } else if (cond.type === "someValuesFrom") {
      triples.push({
        subject: { ...subject },
        predicate: namedNode(cond.property),
        object: freshVar(),
      });
    }
  }
  return triples;
}

/**
 * Rewrite ?x a :Class patterns where :Class is defined via:
 *
 * 1) intersectionOf with nested restrictions
 *    [ intersectionOf (...) ] rdfs:subClassOf :Class
 *
 * 2) unionOf whose members are intersectionOf class expressions
 *    [ unionOf ( branch1 branch2 ) ] rdfs:subClassOf :Class
 *
 * Class conditions within an intersection are recursively expanded.
 * When a class condition has a unionOf definition, the distinct class
 * members from each union branch are extracted — if multiple exist,
 * a SPARQL UNION is generated.
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
        return ontologyIndex.getRestrictionClassDef(t.object.value) !== null ||
          ontologyIndex.getUnionClassDef(t.object.value) !== null;
      });

      if (expandIdx === -1) { i++; continue; }

      const triple = node.triples[expandIdx];
      const subject = triple.subject;
      const classUri = triple.object.value;

      // Case 1: intersectionOf subClassOf
      const restrictionDef = ontologyIndex.getRestrictionClassDef(classUri);
      if (restrictionDef) {
        const newTriples = conditionsToTriples(subject, restrictionDef, ontologyIndex);
        // Check if any triple is a _unionClasses marker
        const unionMarker = newTriples.find((t) => t._unionClasses);
        if (unionMarker) {
          const regularTriples = newTriples.filter((t) => !t._unionClasses);
          const branches = unionMarker._unionClasses.map((cls) => {
            return [
              {
                subject: { ...subject },
                predicate: namedNode(RDF_TYPE),
                object: namedNode(cls),
              },
              ...regularTriples,
            ];
          });
          const unionNode = makeUnion(branches);

          node.triples.splice(expandIdx, 1);
          if (node.triples.length === 0) {
            patterns.splice(i, 1, unionNode);
          } else {
            patterns.splice(i, 0, unionNode);
            i++;
          }
        } else {
          node.triples.splice(expandIdx, 1, ...newTriples);
          i++;
        }
        continue;
      }

      // Case 2: unionOf subClassOf — produce a SPARQL UNION
      const unionDef = ontologyIndex.getUnionClassDef(classUri);
      if (unionDef) {
        const branches = unionDef.map((branchConditions) => {
          return conditionsToTriples(subject, branchConditions, ontologyIndex);
        });
        const unionNode = makeUnion(branches);

        node.triples.splice(expandIdx, 1);
        if (node.triples.length === 0) {
          patterns.splice(i, 1, unionNode);
        } else {
          patterns.splice(i, 0, unionNode);
          i++;
        }
        continue;
      }

      i++;
    }
  });
}

module.exports = { rewrite };
