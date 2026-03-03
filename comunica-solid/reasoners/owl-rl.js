/**
 * OWL RL entailment rules in Notation3.
 *
 * RDFS rules are pulled in via the dependency on "./rdfs".
 *
 * Covers:
 *  - owl:equivalentClass  ↔ mutual rdfs:subClassOf
 *  - owl:equivalentProperty ↔ mutual rdfs:subPropertyOf
 *  - owl:hasValue + owl:onProperty (bidirectional)
 *  - owl:someValuesFrom + owl:onProperty (existential restriction)
 *  - owl:someValuesFrom owl:Thing (special case — any value suffices)
 *  - owl:allValuesFrom + owl:onProperty (universal restriction)
 *  - owl:intersectionOf (decomposition + composition for 2/3/4-member lists)
 *  - owl:unionOf (pairwise)
 *  - owl:SymmetricProperty
 *  - owl:inverseOf
 *  - owl:sameAs (reflexive, symmetric, transitive, property congruence)
 *  - owl:FunctionalProperty
 *  - owl:InverseFunctionalProperty
 *  - owl:propertyChainAxiom (two-step chains via rdf:first/rdf:rest)
 */
const rules = `
@prefix rdf:  <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix owl:  <http://www.w3.org/2002/07/owl#> .

# --- equivalentClass ↔ mutual subClassOf ---
{ ?A owl:equivalentClass ?B . } => { ?A rdfs:subClassOf ?B . ?B rdfs:subClassOf ?A . } .
{ ?A rdfs:subClassOf ?B . ?B rdfs:subClassOf ?A . } => { ?A owl:equivalentClass ?B . } .

# --- equivalentProperty ↔ mutual subPropertyOf ---
{ ?p owl:equivalentProperty ?q . } => { ?p rdfs:subPropertyOf ?q . ?q rdfs:subPropertyOf ?p . } .
{ ?p rdfs:subPropertyOf ?q . ?q rdfs:subPropertyOf ?p . } => { ?p owl:equivalentProperty ?q . } .

# --- hasValue restriction ---
# If x is of a class that hasValue v on property p, then x p v
{ ?C owl:hasValue ?v . ?C owl:onProperty ?p . ?x a ?C . } => { ?x ?p ?v . } .
# If x p v and there is a restriction with hasValue v on p, then x a C
{ ?C owl:hasValue ?v . ?C owl:onProperty ?p . ?x ?p ?v . } => { ?x a ?C . } .

# --- someValuesFrom restriction ---
# If x p y and y a D, and restriction C has someValuesFrom D on p, then x a C
{ ?C owl:someValuesFrom ?D . ?C owl:onProperty ?p . ?x ?p ?y . ?y a ?D . } => { ?x a ?C . } .
# Special case: someValuesFrom owl:Thing — any value suffices
{ ?C owl:someValuesFrom owl:Thing . ?C owl:onProperty ?p . ?x ?p ?y . } => { ?x a ?C . } .

# --- someValuesFrom with nested hasValue restriction ---
# If C has someValuesFrom D on property p,
# and D is a restriction with hasValue v on property q,
# and x p y, and y q v, then x a C
{ ?C owl:someValuesFrom ?D . ?C owl:onProperty ?p .
  ?D owl:hasValue ?v . ?D owl:onProperty ?q .
  ?x ?p ?y . ?y ?q ?v .
} => { ?x a ?C . } .

# --- allValuesFrom restriction ---
# If x a C and C is allValuesFrom D on p, and x p y, then y a D
{ ?C owl:allValuesFrom ?D . ?C owl:onProperty ?p . ?x a ?C . ?x ?p ?y . } => { ?y a ?D . } .

# --- intersectionOf (decomposition: intersection ⊆ each member) ---
{ ?C owl:intersectionOf ?L . ?L rdf:first ?D . } => { ?C rdfs:subClassOf ?D . } .
{ ?C owl:intersectionOf ?L . ?L rdf:rest ?R . ?R rdf:first ?D . } => { ?C rdfs:subClassOf ?D . } .

# --- intersectionOf (composition: member of all parts → member of intersection) ---
# 2-member intersection
{ ?C owl:intersectionOf ?L .
  ?L rdf:first ?D1 . ?L rdf:rest ?L2 .
  ?L2 rdf:first ?D2 . ?L2 rdf:rest rdf:nil .
  ?x a ?D1 . ?x a ?D2 .
} => { ?x a ?C . } .
# 3-member intersection
{ ?C owl:intersectionOf ?L .
  ?L rdf:first ?D1 . ?L rdf:rest ?L2 .
  ?L2 rdf:first ?D2 . ?L2 rdf:rest ?L3 .
  ?L3 rdf:first ?D3 . ?L3 rdf:rest rdf:nil .
  ?x a ?D1 . ?x a ?D2 . ?x a ?D3 .
} => { ?x a ?C . } .
# 4-member intersection
{ ?C owl:intersectionOf ?L .
  ?L rdf:first ?D1 . ?L rdf:rest ?L2 .
  ?L2 rdf:first ?D2 . ?L2 rdf:rest ?L3 .
  ?L3 rdf:first ?D3 . ?L3 rdf:rest ?L4 .
  ?L4 rdf:first ?D4 . ?L4 rdf:rest rdf:nil .
  ?x a ?D1 . ?x a ?D2 . ?x a ?D3 . ?x a ?D4 .
} => { ?x a ?C . } .

# --- unionOf (pairwise) ---
{ ?C owl:unionOf ?L . ?L rdf:first ?D . } => { ?D rdfs:subClassOf ?C . } .
{ ?C owl:unionOf ?L . ?L rdf:rest ?R . ?R rdf:first ?D . } => { ?D rdfs:subClassOf ?C . } .

# --- SymmetricProperty ---
{ ?p a owl:SymmetricProperty . ?x ?p ?y . } => { ?y ?p ?x . } .

# --- inverseOf ---
{ ?p owl:inverseOf ?q . ?x ?p ?y . } => { ?y ?q ?x . } .
{ ?p owl:inverseOf ?q . ?x ?q ?y . } => { ?y ?p ?x . } .

# --- sameAs ---
# reflexive
{ ?x owl:sameAs ?y . } => { ?y owl:sameAs ?x . } .
# transitive
{ ?x owl:sameAs ?y . ?y owl:sameAs ?z . } => { ?x owl:sameAs ?z . } .
# property congruence – propagate predicates across sameAs
{ ?x owl:sameAs ?y . ?x ?p ?o . } => { ?y ?p ?o . } .
{ ?x owl:sameAs ?y . ?s ?p ?x . } => { ?s ?p ?y . } .

# --- FunctionalProperty ---
# If p is functional and x p y1, x p y2, then y1 sameAs y2
{ ?p a owl:FunctionalProperty . ?x ?p ?y1 . ?x ?p ?y2 . } => { ?y1 owl:sameAs ?y2 . } .

# --- InverseFunctionalProperty ---
{ ?p a owl:InverseFunctionalProperty . ?x1 ?p ?y . ?x2 ?p ?y . } => { ?x1 owl:sameAs ?x2 . } .

# --- propertyChainAxiom (two-step chain via list) ---
{ ?p owl:propertyChainAxiom ?L .
  ?L rdf:first ?q . ?L rdf:rest ?M . ?M rdf:first ?r .
  ?x ?q ?y . ?y ?r ?z .
} => { ?x ?p ?z . } .
`;

module.exports = { rules, depends: [require("./rdfs")] };
