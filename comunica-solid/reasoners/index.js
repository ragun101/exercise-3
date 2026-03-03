const { Store, Parser, Reasoner } = require("n3");

const rdfs = require("./rdfs");
const owlRl = require("./owl-rl");

const REASONERS = {
  rdfs,
  "owl-rl": owlRl,
};

/**
 * Collects all N3 rule strings for a reasoner module and its transitive
 * dependencies (depth-first, deduplicated) so that shared rules like RDFS
 * are never applied twice.
 */
function collectRules(mod, seen = new Set()) {
  if (seen.has(mod)) return "";
  seen.add(mod);

  let combined = "";
  for (const dep of mod.depends) {
    combined += collectRules(dep, seen);
  }
  combined += mod.rules + "\n";
  return combined;
}

// Pre-parse and cache a rules Store for each registered reasoner.
const rulesStoreCache = new Map();

function getRulesStore(name) {
  if (rulesStoreCache.has(name)) return rulesStoreCache.get(name);

  const mod = REASONERS[name];
  if (!mod) throw new Error(`Unknown reasoner: "${name}"`);

  const allRules = collectRules(mod);
  const parser = new Parser({ format: "text/n3" });
  const store = new Store(parser.parse(allRules));
  rulesStoreCache.set(name, store);
  return store;
}

/**
 * Applies the named reasoner to an N3 Store (mutates it in place).
 *
 * @param {string} name  - One of "rdfs", "owl-rl"
 * @param {import("n3").Store} store - The data store to reason over
 */
function applyReasoner(name, store) {
  const rulesStore = getRulesStore(name);
  const reasoner = new Reasoner(store);
  reasoner.reason(rulesStore);
}

/**
 * Returns the list of available reasoner names.
 */
function availableReasoners() {
  return Object.keys(REASONERS);
}

module.exports = { applyReasoner, availableReasoners };
