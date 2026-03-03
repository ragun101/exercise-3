const { Store, Parser, DataFactory } = require("n3");
const crypto = require("crypto");

const SKOLEM_BASE = "http://example.org/.well-known/genid/";

const RDFS = "http://www.w3.org/2000/01/rdf-schema#";
const OWL = "http://www.w3.org/2002/07/owl#";
const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";

const RDFS_SUBCLASSOF = RDFS + "subClassOf";
const RDFS_SUBPROPERTYOF = RDFS + "subPropertyOf";
const RDFS_DOMAIN = RDFS + "domain";
const RDFS_RANGE = RDFS + "range";
const OWL_EQUIVALENTCLASS = OWL + "equivalentClass";
const OWL_EQUIVALENTPROPERTY = OWL + "equivalentProperty";
const OWL_INVERSEOF = OWL + "inverseOf";
const OWL_SAMEAS = OWL + "sameAs";
const OWL_SYMMETRICPROPERTY = OWL + "SymmetricProperty";
const OWL_TRANSITIVEPROPERTY = OWL + "TransitiveProperty";
const OWL_INTERSECTIONOF = OWL + "intersectionOf";
const OWL_ONPROPERTY = OWL + "onProperty";
const OWL_SOMEVALUESFROM = OWL + "someValuesFrom";
const OWL_HASVALUE = OWL + "hasValue";
const RDF_TYPE = RDF + "type";
const RDF_FIRST = RDF + "first";
const RDF_REST = RDF + "rest";
const RDF_NIL = RDF + "nil";

class OntologyIndex {
  constructor(turtleString) {
    const parser = new Parser();
    const quads = parser.parse(turtleString);

    // Skolemize blank nodes: replace each BlankNode with a NamedNode using a UUID IRI
    const bnodeMap = new Map();
    function skolemize(term) {
      if (term.termType === "BlankNode") {
        if (!bnodeMap.has(term.value)) {
          bnodeMap.set(term.value, DataFactory.namedNode(SKOLEM_BASE + crypto.randomUUID()));
        }
        return bnodeMap.get(term.value);
      }
      return term;
    }
    const skolemizedQuads = quads.map((q) =>
      DataFactory.quad(skolemize(q.subject), skolemize(q.predicate), skolemize(q.object), skolemize(q.graph))
    );

    this.store = new Store(skolemizedQuads);

    // Pre-expand equivalentClass into mutual subClassOf
    for (const q of this.store.getQuads(null, OWL_EQUIVALENTCLASS, null)) {
      this.store.addQuad(q.subject, { termType: "NamedNode", value: RDFS_SUBCLASSOF }, q.object);
      this.store.addQuad(q.object, { termType: "NamedNode", value: RDFS_SUBCLASSOF }, q.subject);
    }

    // Pre-expand equivalentProperty into mutual subPropertyOf
    for (const q of this.store.getQuads(null, OWL_EQUIVALENTPROPERTY, null)) {
      this.store.addQuad(q.subject, { termType: "NamedNode", value: RDFS_SUBPROPERTYOF }, q.object);
      this.store.addQuad(q.object, { termType: "NamedNode", value: RDFS_SUBPROPERTYOF }, q.subject);
    }
  }

  /**
   * Get all transitive subclasses of a class URI (not including the class itself).
   */
  getAllSubClasses(classUri) {
    return this._transitiveClosureInverse(classUri, RDFS_SUBCLASSOF);
  }

  /**
   * Get all transitive sub-properties of a property URI (not including the property itself).
   */
  getAllSubProperties(propUri) {
    return this._transitiveClosureInverse(propUri, RDFS_SUBPROPERTYOF);
  }

  /**
   * Get all inverse properties of a property URI (bidirectional lookup).
   */
  getInverseProperties(propUri) {
    const inverses = new Set();
    for (const q of this.store.getQuads(propUri, OWL_INVERSEOF, null)) {
      inverses.add(q.object.value);
    }
    for (const q of this.store.getQuads(null, OWL_INVERSEOF, propUri)) {
      inverses.add(q.subject.value);
    }
    return inverses;
  }

  /**
   * Check if a property is declared as owl:SymmetricProperty.
   */
  isSymmetric(propUri) {
    return this.store.getQuads(propUri, RDF_TYPE, OWL_SYMMETRICPROPERTY).length > 0;
  }

  /**
   * Check if a property is declared as owl:TransitiveProperty.
   */
  isTransitive(propUri) {
    return this.store.getQuads(propUri, RDF_TYPE, OWL_TRANSITIVEPROPERTY).length > 0;
  }

  /**
   * Check if a URI represents an anonymous OWL class expression
   * (restriction, intersection, union) rather than a real named class.
   * Handles both skolemized blank nodes and fragment-only IRIs used as bnodes.
   */
  isAnonymousClassExpression(uri) {
    if (uri.startsWith(SKOLEM_BASE)) return true;
    return this.store.getQuads(uri, OWL_ONPROPERTY, null).length > 0 ||
      this.store.getQuads(uri, OWL_INTERSECTIONOF, null).length > 0 ||
      this.store.getQuads(uri, OWL + "unionOf", null).length > 0;
  }

  /**
   * Get all properties that have rdfs:domain of the given class.
   */
  getPropertiesWithDomain(classUri) {
    const props = new Set();
    for (const q of this.store.getQuads(null, RDFS_DOMAIN, classUri)) {
      props.add(q.subject.value);
    }
    return props;
  }

  /**
   * Get all properties that have rdfs:range of the given class.
   */
  getPropertiesWithRange(classUri) {
    const props = new Set();
    for (const q of this.store.getQuads(null, RDFS_RANGE, classUri)) {
      props.add(q.subject.value);
    }
    return props;
  }

  /**
   * Get all owl:sameAs aliases for a given URI (bidirectional).
   */
  getSameAs(uri) {
    const aliases = new Set();
    for (const q of this.store.getQuads(uri, OWL_SAMEAS, null)) {
      if (q.object.termType === "NamedNode") aliases.add(q.object.value);
    }
    for (const q of this.store.getQuads(null, OWL_SAMEAS, uri)) {
      if (q.subject.termType === "NamedNode") aliases.add(q.subject.value);
    }
    return aliases;
  }

  /**
   * Extract conditions from an intersection member list.
   * Shared by getRestrictionClassDef and getUnionClassDef.
   */
  _extractIntersectionConditions(members) {
    const conditions = [];
    for (const memberUri of members) {
      // Check if this member is an owl:Restriction (by type or by having owl:onProperty)
      const onPropQuads = this.store.getQuads(memberUri, OWL_ONPROPERTY, null);
      const isRestriction = onPropQuads.length > 0 ||
        this.store.getQuads(memberUri, RDF_TYPE, OWL + "Restriction").length > 0;

      if (!isRestriction) {
        // It's a named class (e.g., td:ActionAffordance, workflow:ToolAction)
        conditions.push({ type: "class", classUri: memberUri });
        continue;
      }

      // It's an owl:Restriction — check for someValuesFrom
      const svfQuads = this.store.getQuads(memberUri, OWL_SOMEVALUESFROM, null);

      if (onPropQuads.length > 0 && svfQuads.length > 0) {
        const property = onPropQuads[0].object.value;
        const rangeNode = svfQuads[0].object.value;

        // Check if rangeNode is itself a restriction with hasValue
        const nestedOnProp = this.store.getQuads(rangeNode, OWL_ONPROPERTY, null);
        const nestedHasValue = this.store.getQuads(rangeNode, OWL_HASVALUE, null);

        if (nestedOnProp.length > 0 && nestedHasValue.length > 0) {
          conditions.push({
            type: "someValuesFrom",
            property,
            nestedProperty: nestedOnProp[0].object.value,
            hasValue: nestedHasValue[0].object.value,
          });
        } else {
          // Simple someValuesFrom (e.g., someValuesFrom owl:Thing)
          conditions.push({ type: "someValuesFrom", property });
        }
      }
    }
    return conditions;
  }

  /**
   * Get the structural definition of a class defined via:
   *   [ owl:intersectionOf (...) ] rdfs:subClassOf :NamedClass
   *
   * Returns an array of condition objects, or null if no such definition exists.
   */
  getRestrictionClassDef(classUri) {
    // Find all ?bnode rdfs:subClassOf classUri
    const subClassQuads = this.store.getQuads(null, RDFS_SUBCLASSOF, classUri);
    for (const scQuad of subClassQuads) {
      const bnode = scQuad.subject.value;
      // Check if this bnode has an owl:intersectionOf
      const intQuads = this.store.getQuads(bnode, OWL_INTERSECTIONOF, null);
      if (intQuads.length === 0) continue;

      const listHead = intQuads[0].object.value;
      const members = this._collectList(listHead);
      if (members.length === 0) continue;

      const conditions = this._extractIntersectionConditions(members);
      if (conditions.length > 0) return conditions;
    }
    return null;
  }

  /**
   * Get the structural definition of a class defined via:
   *   [ owl:unionOf ( branch1 branch2 ... ) ] rdfs:subClassOf :NamedClass
   * where each branch is an [ owl:intersectionOf (...) ] class expression.
   *
   * Returns an array of branches (each branch is an array of conditions),
   * or null if no such definition exists.
   */
  getUnionClassDef(classUri) {
    const subClassQuads = this.store.getQuads(null, RDFS_SUBCLASSOF, classUri);
    for (const scQuad of subClassQuads) {
      const bnode = scQuad.subject.value;
      const unionQuads = this.store.getQuads(bnode, OWL + "unionOf", null);
      if (unionQuads.length === 0) continue;

      const unionListHead = unionQuads[0].object.value;
      const unionMembers = this._collectList(unionListHead);
      if (unionMembers.length === 0) continue;

      const branches = [];
      for (const branchUri of unionMembers) {
        // Each branch should be an intersectionOf class expression
        const intQuads = this.store.getQuads(branchUri, OWL_INTERSECTIONOF, null);
        if (intQuads.length === 0) continue;

        const listHead = intQuads[0].object.value;
        const members = this._collectList(listHead);
        if (members.length === 0) continue;

        const conditions = this._extractIntersectionConditions(members);
        if (conditions.length > 0) branches.push(conditions);
      }

      if (branches.length > 0) return branches;
    }
    return null;
  }

  /**
   * Collect members of an RDF list (rdf:first/rdf:rest chain).
   */
  _collectList(headUri) {
    const members = [];
    let current = headUri;
    while (current && current !== RDF_NIL) {
      const firstQuads = this.store.getQuads(current, RDF_FIRST, null);
      if (firstQuads.length === 0) break;
      members.push(firstQuads[0].object.value);
      const restQuads = this.store.getQuads(current, RDF_REST, null);
      if (restQuads.length === 0) break;
      current = restQuads[0].object.value;
    }
    return members;
  }

  /**
   * Get all named classes that are structurally defined as subclasses of
   * the given class URI — i.e., classes whose intersectionOf definition
   * includes classUri as a member (directly or transitively via union branches).
   *
   * For example, if WebFetchAction is defined via:
   *   [ intersectionOf(ToolAction, R1, R2) ] rdfs:subClassOf WebFetchAction
   * then getNamedSubClassesOfClass("...ToolAction") returns { "...WebFetchAction" }.
   */
  getNamedSubClassesOfClass(classUri) {
    const result = new Set();
    // Scan all named classes that have a restriction (intersectionOf) def
    // and check if classUri appears as a class condition
    for (const q of this.store.getQuads(null, RDFS_SUBCLASSOF, null)) {
      const definedClass = q.object.value;
      // Skip anonymous class expressions
      if (this.isAnonymousClassExpression(definedClass)) continue;
      // Skip the class itself
      if (definedClass === classUri) continue;

      const def = this.getRestrictionClassDef(definedClass);
      if (def) {
        for (const cond of def) {
          if (cond.type === "class" && cond.classUri === classUri) {
            result.add(definedClass);
          }
          // Also check if a class condition transitively includes classUri
          // (e.g., the class condition is itself defined via union with classUri as a member)
          if (cond.type === "class" && cond.classUri !== classUri) {
            const unionDef = this.getUnionClassDef(cond.classUri);
            if (unionDef) {
              for (const branch of unionDef) {
                for (const bc of branch) {
                  if (bc.type === "class" && bc.classUri === classUri) {
                    result.add(definedClass);
                  }
                }
              }
            }
          }
        }
      }
    }
    // Recurse: classes that are subclasses of our results are also subclasses
    const queue = [...result];
    while (queue.length > 0) {
      const cls = queue.shift();
      for (const sub of this.getNamedSubClassesOfClass(cls)) {
        if (!result.has(sub)) {
          result.add(sub);
          queue.push(sub);
        }
      }
    }
    return result;
  }

  /**
   * BFS to find all X where X <predicate> target (transitively).
   * E.g. for subClassOf: find all classes C where C subClassOf* target.
   */
  _transitiveClosureInverse(targetUri, predicateUri) {
    const result = new Set();
    const queue = [targetUri];
    const visited = new Set([targetUri]);

    while (queue.length > 0) {
      const current = queue.shift();
      // Find all ?x <pred> current
      for (const q of this.store.getQuads(null, predicateUri, current)) {
        const child = q.subject.value;
        if (!visited.has(child)) {
          visited.add(child);
          result.add(child);
          queue.push(child);
        }
      }
    }
    return result;
  }
}

module.exports = { OntologyIndex };
