const { cloneTriple, namedNode, makeUnion, walkPatterns } = require("./ast-utils");

/**
 * Rewrite triples that reference entities with owl:sameAs declarations.
 * For each concrete subject/object that has sameAs aliases, adds UNION
 * branches with the alias substituted, so link traversal discovers
 * the alias's data.
 *
 * Example: if alice sameAs aliceAlt, then
 *   ex:alice rdfs:label ?lbl
 *   =>  { ex:alice rdfs:label ?lbl } UNION { ex:aliceAlt rdfs:label ?lbl }
 */
function rewrite(ast, ontologyIndex) {
  // First pass: handle top-level and nested group patterns (via walkPatterns)
  walkPatterns(ast.where, (patterns) => {
    expandInPatterns(patterns, ontologyIndex);
  });

  // Second pass: walk into UNION branches (which walkPatterns skips for BGPs)
  expandInUnions(ast.where, ontologyIndex);
}

/**
 * Build alias BGPs for a triple's sameAs-expanded subjects/objects.
 * Returns an array of BGP nodes (one per alias), or empty if no aliases.
 */
function buildAliasBgps(triple, ontologyIndex) {
  const aliasTriples = [];

  if (triple.subject.termType === "NamedNode") {
    for (const alias of ontologyIndex.getSameAs(triple.subject.value)) {
      const alt = cloneTriple(triple);
      alt.subject = namedNode(alias);
      aliasTriples.push(alt);
    }
  }

  if (triple.object.termType === "NamedNode") {
    for (const alias of ontologyIndex.getSameAs(triple.object.value)) {
      const alt = cloneTriple(triple);
      alt.object = namedNode(alias);
      aliasTriples.push(alt);
    }
  }

  return aliasTriples.map((t) => ({ type: "bgp", triples: [t] }));
}

/**
 * Expand sameAs aliases in BGP triples within a patterns array.
 */
function expandInPatterns(patterns, ontologyIndex) {
  let i = 0;
  while (i < patterns.length) {
    const node = patterns[i];
    if (node.type !== "bgp") { i++; continue; }

    const expandIdx = node.triples.findIndex((t) => {
      if (t.subject.termType === "NamedNode" && ontologyIndex.getSameAs(t.subject.value).size > 0) return true;
      if (t.object.termType === "NamedNode" && ontologyIndex.getSameAs(t.object.value).size > 0) return true;
      return false;
    });

    if (expandIdx === -1) { i++; continue; }

    const triple = node.triples[expandIdx];
    const aliasBgps = buildAliasBgps(triple, ontologyIndex);
    if (aliasBgps.length === 0) { i++; continue; }

    const branches = [{ type: "bgp", triples: [cloneTriple(triple)] }, ...aliasBgps];
    const unionNode = makeUnion(branches.map((bgp) => [bgp.triples[0]]));

    node.triples.splice(expandIdx, 1);
    if (node.triples.length === 0) {
      patterns.splice(i, 1, unionNode);
    } else {
      patterns.splice(i, 0, unionNode);
      i++;
    }
  }
}

/**
 * Recursively walk into UNION branches and expand sameAs in their BGPs.
 * Alias branches are added as flat siblings in the parent UNION (no nesting).
 */
function expandInUnions(patterns, ontologyIndex) {
  if (!Array.isArray(patterns)) return;

  for (const node of patterns) {
    if (!node) continue;

    if (node.type === "union") {
      // Collect new branches to add (flattened into the parent UNION)
      const newBranches = [];

      for (const branch of node.patterns) {
        if (branch.type === "bgp") {
          for (const triple of branch.triples) {
            const aliasBgps = buildAliasBgps(triple, ontologyIndex);
            newBranches.push(...aliasBgps);
          }
        } else if (Array.isArray(branch.patterns)) {
          expandInUnions(branch.patterns, ontologyIndex);
        }
      }

      // Add alias branches as siblings in the UNION
      node.patterns.push(...newBranches);
    } else if (node.type === "optional" || node.type === "group" || node.type === "minus") {
      expandInUnions(node.patterns, ontologyIndex);
    }
  }
}

module.exports = { rewrite };
