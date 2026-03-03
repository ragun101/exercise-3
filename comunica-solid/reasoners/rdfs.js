/**
 * RDFS entailment rules in Notation3.
 *
 * Covers the core RDFS semantics:
 *  - rdfs2:  domain inference
 *  - rdfs3:  range inference
 *  - rdfs5:  transitive rdfs:subPropertyOf
 *  - rdfs7:  rdfs:subPropertyOf propagation
 *  - rdfs9:  rdfs:subClassOf type propagation
 *  - rdfs11: transitive rdfs:subClassOf
 */
const rules = `
@prefix rdf:  <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

# rdfs2 – domain
{ ?p rdfs:domain ?C . ?s ?p ?o . } => { ?s a ?C . } .

# rdfs3 – range
{ ?p rdfs:range ?C . ?s ?p ?o . } => { ?o a ?C . } .

# rdfs5 – transitive subPropertyOf
{ ?p rdfs:subPropertyOf ?q . ?q rdfs:subPropertyOf ?r . } => { ?p rdfs:subPropertyOf ?r . } .

# rdfs7 – subPropertyOf propagation
{ ?p rdfs:subPropertyOf ?q . ?s ?p ?o . } => { ?s ?q ?o . } .

# rdfs9 – subClassOf type propagation
{ ?C rdfs:subClassOf ?D . ?x a ?C . } => { ?x a ?D . } .

# rdfs11 – transitive subClassOf
{ ?C rdfs:subClassOf ?D . ?D rdfs:subClassOf ?E . } => { ?C rdfs:subClassOf ?E . } .
`;

// Each reasoner exports its own rules and the list of reasoners it depends on.
module.exports = { rules, depends: [] };
