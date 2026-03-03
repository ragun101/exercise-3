require("events").EventEmitter.defaultMaxListeners = 50;
const express = require("express");
require("dotenv").config();

const { initSession, getAuthFetch, getWebId, getSession } = require("./solid-auth");
const { parseTurtle, writeResource, modifyResource, deleteResource } = require("./solid-client");
const { initEngines, executeSparqlLinkTraversal, executeSparqlDirect, invalidateHttpCache } = require("./sparql");
const { availableReasoners } = require("./reasoners");

const path = require("path");

const app = express();
app.use(express.json());
app.use(express.text({ type: "text/turtle" }));
app.use(express.static(path.join(__dirname, "ui", "dist")));

const PORT = process.env.PORT || 7200;

/**
 * POST /query
 *
 * Executes a SPARQL SELECT query using link traversal. The engine derives
 * sources from the query itself by following links between documents.
 *
 * An optional `reasoner` field enables entailment reasoning on the
 * retrieved data before executing the SELECT. Supported values:
 * "rdfs", "owl-rl". Default: no reasoning.
 *
 * An optional `ontology` field (Turtle string) enables the hybrid pipeline:
 * the query is rewritten using ontology axioms (subclass/subproperty
 * hierarchies, inverseOf, symmetric properties) for targeted link
 * traversal, then remaining rules are materialized on the fetched data.
 *
 * @headers Content-Type: application/json
 * @body {Object} request
 * @body {string} request.query - The SPARQL query string
 * @body {string} [request.reasoner] - Optional reasoner ("rdfs" | "owl-rl")
 * @body {string} [request.ontology] - Optional ontology as Turtle string (requires reasoner)
 * @returns {Object} SPARQL JSON results ({ head: { vars }, results: { bindings } })
 *
 * @example
 * // Request (with reasoning)
 * fetch("http://localhost:7200/query", {
 *   method: "POST",
 *   headers: { "Content-Type": "application/json" },
 *   body: JSON.stringify({
 *     query: "PREFIX foaf: <http://xmlns.com/foaf/0.1/> SELECT ?name WHERE { ?s foaf:name ?name }",
 *     reasoner: "rdfs"
 *   })
 * });
 *
 * // Response
 * {
 *   "head": { "vars": ["name"] },
 *   "results": {
 *     "bindings": [
 *       { "name": { "type": "literal", "value": "Alice" } }
 *     ]
 *   }
 * }
 */
app.post("/query", async (req, res) => {
  const { query, reasoner, ontology, startSources, invalidateCache } = req.body;
  if (!query) {
    return res.status(400).json({ error: "Missing 'query' in request body" });
  }

  if (reasoner && !availableReasoners().includes(reasoner)) {
    return res.status(400).json({
      error: `Unknown reasoner "${reasoner}". Available: ${availableReasoners().join(", ")}`,
    });
  }

  try {
    // Extract document URLs from URIs in the query (strip fragment identifiers)
    const uriPattern = /<(https?:\/\/[^>]+)>/g;
    // Derive pod base from webId (e.g. .../profile/card#me → .../)
    const webId = getWebId();
    const podBase = process.env.SOLID_POD || webId.replace(/\/profile\/card#me$/, "/");
    const defaultSources = startSources?.length ? startSources : [podBase];
    const sources = new Set([webId, ...defaultSources]);
    let match;
    while ((match = uriPattern.exec(query)) !== null) {
      const url = new URL(match[1]);
      url.hash = "";
      sources.add(url.href);
    }

    const context = {
      sources: [...sources],
      '@comunica/actor-http-inrupt-solid-client-authn:session': getSession(),
      lenient: true,
    };
    if (invalidateCache) context.invalidateCache = true;

    const result = await executeSparqlLinkTraversal(query, context, reasoner || null, ontology || null);
    res.json(result);
  } catch (err) {
    console.error("SPARQL query error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /query-sources
 *
 * Executes a SPARQL SELECT query against explicitly provided sources
 * (no link traversal). The caller supplies the list of source URLs directly.
 *
 * Supports the same optional `reasoner` and `ontology` fields as /query.
 *
 * @headers Content-Type: application/json
 * @body {Object} request
 * @body {string} request.query - The SPARQL query string
 * @body {string[]} request.sources - Array of source URLs to query
 * @body {string} [request.reasoner] - Optional reasoner ("rdfs" | "owl-rl")
 * @body {string} [request.ontology] - Optional ontology as Turtle string (requires reasoner)
 * @returns {Object} SPARQL JSON results ({ head: { vars }, results: { bindings } })
 *
 * @example
 * // Request
 * fetch("http://localhost:7200/query-sources", {
 *   method: "POST",
 *   headers: { "Content-Type": "application/json" },
 *   body: JSON.stringify({
 *     query: "SELECT * WHERE { ?s ?p ?o } LIMIT 100",
 *     sources: ["https://alice.pod.example/profile/card"]
 *   })
 * });
 */
app.post("/query-sources", async (req, res) => {
  const { query, sources, reasoner, ontology, invalidateCache } = req.body;
  if (!query) {
    return res.status(400).json({ error: "Missing 'query' in request body" });
  }
  if (!sources || !Array.isArray(sources) || sources.length === 0) {
    return res.status(400).json({ error: "Missing or empty 'sources' array in request body" });
  }

  if (reasoner && !availableReasoners().includes(reasoner)) {
    return res.status(400).json({
      error: `Unknown reasoner "${reasoner}". Available: ${availableReasoners().join(", ")}`,
    });
  }

  try {
    const context = {
      sources,
      '@comunica/actor-http-inrupt-solid-client-authn:session': getSession(),
      lenient: true,
    };
    if (invalidateCache) context.invalidateCache = true;

    const result = await executeSparqlDirect(query, context, reasoner || null, ontology || null);
    res.json(result);
  } catch (err) {
    console.error("SPARQL direct query error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /write?url=<resource-url>
 *
 * Creates a new RDF resource in the user's Solid pod from Turtle input.
 * The resource URL is where the data will be stored inside the pod.
 *
 * The `url` query parameter is a full URL pointing to a location inside the
 * user's pod, e.g. https://alice.pod.example/farm/tractors. Subjects in the
 * Turtle that use fragment identifiers (#tractor1) will be resolved relative
 * to this URL (becoming https://alice.pod.example/farm/tractors#tractor1).
 *
 * @headers Content-Type: text/turtle
 * @query {string} url - Full URL of the resource to create inside the pod
 * @body {string} Turtle-serialized RDF triples
 * @returns {{ status: "created", url: string }}
 *
 * @example
 * // Request — create a new resource with two tractors
 * fetch("http://localhost:7200/write?url=https://alice.pod.example/farm/tractors", {
 *   method: "POST",
 *   headers: { "Content-Type": "text/turtle" },
 *   body: `
 *     @prefix was: <https://was-course.interactions.ics.unisg.ch/farm-ontology#> .
 *     @prefix schema: <https://schema.org/> .
 *
 *     <https://alice.pod.example/farm/tractors#tractor1>
 *       a was:Tractor ;
 *       schema:name "Big Red" .
 *
 *     <https://alice.pod.example/farm/tractors#tractor2>
 *       a was:Tractor ;
 *       schema:name "Old Reliable" .
 *   `
 * });
 *
 * // Response
 * { "status": "created", "url": "https://alice.pod.example/farm/tractors" }
 */
app.post("/write", async (req, res) => {
  const resourceUrl = req.query.url;
  if (!resourceUrl) {
    return res.status(400).json({ error: "Missing 'url' query parameter" });
  }
  if (resourceUrl.includes("/profile/card")) {
    return res.status(403).json({ error: "Cannot modify profile card via this application" });
  }

  const turtle = req.body;
  const isContainer = resourceUrl.endsWith("/");
  if (!turtle && !isContainer) {
    return res.status(400).json({ error: "Missing Turtle body" });
  }

  try {
    const quads = turtle ? parseTurtle(turtle, resourceUrl) : [];
    await writeResource(resourceUrl, quads, getAuthFetch());
    await invalidateHttpCache(resourceUrl);
    res.json({ status: "created", url: resourceUrl });
  } catch (err) {
    console.error("Write error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /modify?url=<resource-url>
 *
 * Merges Turtle triples into an existing resource in the user's Solid pod.
 * If the resource doesn't exist yet, it is created automatically.
 * If a Thing (subject) already exists, new properties are added to it.
 *
 * Returns 409 Conflict if the resource was modified by another process
 * between the fetch and the save (see Solid changelog semantics).
 *
 * @headers Content-Type: text/turtle
 * @query {string} url - Full URL of the existing resource inside the pod
 * @body {string} Turtle-serialized RDF triples to merge
 * @returns {{ status: "modified", url: string }}
 *
 * @example
 * // Request — add a moisture reading property to an existing tractor
 * fetch("http://localhost:7200/modify?url=https://alice.pod.example/farm/tractors", {
 *   method: "PUT",
 *   headers: { "Content-Type": "text/turtle" },
 *   body: `
 *     @prefix was: <https://was-course.interactions.ics.unisg.ch/farm-ontology#> .
 *     @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
 *
 *     <https://alice.pod.example/farm/tractors#tractor1>
 *       was:lastMoistureReading "72"^^xsd:integer .
 *   `
 * });
 *
 * // Response
 * { "status": "modified", "url": "https://alice.pod.example/farm/tractors" }
 *
 * // 409 response (if concurrent modification)
 * { "error": "Conflict: the resource was modified by another process", "details": "..." }
 */
app.put("/modify", async (req, res) => {
  const resourceUrl = req.query.url;
  if (!resourceUrl) {
    return res.status(400).json({ error: "Missing 'url' query parameter" });
  }
  if (resourceUrl.includes("/profile/card")) {
    return res.status(403).json({ error: "Cannot modify profile card via this application" });
  }

  const turtle = req.body;
  if (!turtle) {
    return res.status(400).json({ error: "Missing Turtle body" });
  }

  try {
    const quads = parseTurtle(turtle, resourceUrl);
    await modifyResource(resourceUrl, quads, getAuthFetch());
    await invalidateHttpCache(resourceUrl);
    res.json({ status: "modified", url: resourceUrl });
  } catch (err) {
    if (err.statusCode === 409) {
      res.status(409).json({
        error: "Conflict: the resource was modified by another process",
        details: err.message,
      });
    } else {
      console.error("Modify error:", err);
      res.status(500).json({ error: err.message });
    }
  }
});

/**
 * DELETE /delete?url=<resource-url>
 *
 * Deletes an entire RDF resource from the user's Solid pod.
 *
 * @query {string} url - Full URL of the resource to delete from the pod
 * @returns {{ status: "deleted", url: string }}
 *
 * @example
 * // Request
 * fetch("http://localhost:7200/delete?url=https://alice.pod.example/farm/tractors", {
 *   method: "DELETE"
 * });
 *
 * // Response
 * { "status": "deleted", "url": "https://alice.pod.example/farm/tractors" }
 */
app.delete("/delete", async (req, res) => {
  const resourceUrl = req.query.url;
  if (!resourceUrl) {
    return res.status(400).json({ error: "Missing 'url' query parameter" });
  }
  if (resourceUrl.includes("/profile/card")) {
    return res.status(403).json({ error: "Cannot modify profile card via this application" });
  }

  try {
    await deleteResource(resourceUrl, getAuthFetch());
    await invalidateHttpCache(resourceUrl);
    res.json({ status: "deleted", url: resourceUrl });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /health
 *
 * Returns the server's login status and the authenticated user's webId.
 *
 * @returns {{ status: string, loggedIn: boolean, webId: string|null }}
 *
 * @example
 * // Response
 * {
 *   "status": "ok",
 *   "loggedIn": true,
 *   "webId": "https://alice.pod.example/profile/card#me"
 * }
 */
/**
 * GET /read?url=<resource-url>
 *
 * Fetches the raw content of a resource from the Solid pod using authenticated
 * fetch and returns it as-is. Useful for loading existing Turtle files for editing.
 *
 * @query {string} url - Full URL of the resource to read from the pod
 * @returns Raw resource content with its original Content-Type
 */
app.get("/read", async (req, res) => {
  const resourceUrl = req.query.url;
  if (!resourceUrl) {
    return res.status(400).json({ error: "Missing 'url' query parameter" });
  }

  try {
    const authFetch = getAuthFetch();
    const fetchFn = authFetch || globalThis.fetch;
    const response = await fetchFn(resourceUrl, {
      headers: { Accept: "text/turtle" },
    });

    if (!response.ok) {
      return res.status(response.status).json({
        error: `Failed to fetch resource: ${response.statusText}`,
      });
    }

    const body = await response.text();
    const contentType = response.headers.get("content-type") || "text/turtle";
    res.set("Content-Type", contentType);
    res.send(body);
  } catch (err) {
    console.error("Read error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    loggedIn: getAuthFetch() !== null,
    webId: getWebId() || null,
    podBase: process.env.SOLID_POD || null,
  });
});

initEngines();
initSession().then(() => {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Comunica Solid SPARQL endpoint running on port ${PORT}`);
  });
});
