import { useState, useRef, useEffect } from "react";
import Yasqe from "@triply/yasqe";
import "@triply/yasqe/build/yasqe.min.css";
import Yasr from "@triply/yasr";
import "@triply/yasr/build/yasr.min.css";
import Tooltip from "./Tooltip.jsx";

const REASONERS = [
  { value: "rdfs", label: "RDFS" },
  { value: "owl-rl", label: "OWL-RL" },
];

const DOMAIN_PREFIXES = {
  td: "https://www.w3.org/2019/wot/td#",
  jsonschema: "https://www.w3.org/2019/wot/json-schema#",
  wotsec: "https://www.w3.org/2019/wot/security#",
  htv: "http://www.w3.org/2011/http#",
  hctl: "https://www.w3.org/2019/wot/hypermedia#",
  workflow: "https://purl.org/workflow/ontology#",
  "p-plan": "http://purl.org/net/p-plan#",
  ldp: "http://www.w3.org/ns/ldp#",
  quiz: "http://jelenajovanovic.net/ontologies/loco/quiz/ns#",
};

const QUERY_MODES = [
  { value: "direct", label: "Direct Sources" },
  { value: "link-traversal", label: "Link Traversal" },
];

async function computeHash(text) {
  const encoded = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function SourceList({ label, tooltip, sources, onAdd, onRemove }) {
  const [newSource, setNewSource] = useState("");

  function handleAdd() {
    const url = newSource.trim();
    if (url && !sources.includes(url)) {
      onAdd(url);
      setNewSource("");
    }
  }

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-2">
        <label className="text-sm font-bold uppercase tracking-wide text-black">
          {label}
        </label>
        {tooltip}
      </div>
      <div className="flex flex-wrap gap-2 mb-2">
        {sources.map((src, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1 px-3 py-1 text-xs font-mono bg-swiss-green-light text-swiss-green-dark border border-swiss-green"
          >
            {src}
            <button
              onClick={() => onRemove(i)}
              className="ml-1 text-swiss-green-dark hover:text-red-600 font-bold"
              title="Remove source"
            >
              x
            </button>
          </span>
        ))}
        {sources.length === 0 && (
          <span className="text-xs text-gray-400">No sources added yet</span>
        )}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={newSource}
          onChange={(e) => setNewSource(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
          placeholder="https://pod.example/resource"
          className="flex-1 border-2 border-black px-3 py-2 text-sm font-mono"
        />
        <button
          onClick={handleAdd}
          className="px-4 py-2 text-sm font-bold uppercase tracking-wide border-2 border-black hover:bg-black hover:text-white transition-colors"
        >
          Add
        </button>
      </div>
    </div>
  );
}

function loadStoredJson(key, fallback) {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
}

export default function QueryPanel({ podBase, ontology, ontologies = [], setActiveTab }) {
  const yasqeRef = useRef(null);
  const yasrRef = useRef(null);
  const yasqeInstance = useRef(null);
  const yasrInstance = useRef(null);

  const [queryMode, setQueryMode] = useState(() => loadStoredJson("queryPanel:queryMode", "direct"));
  const [sources, setSources] = useState(() => loadStoredJson("queryPanel:sources", []));
  const [useReasoner, setUseReasoner] = useState(() => loadStoredJson("queryPanel:useReasoner", false));
  const [reasoner, setReasoner] = useState(() => loadStoredJson("queryPanel:reasoner", "rdfs"));
  const [status, setStatus] = useState(null);
  const [running, setRunning] = useState(false);
  const [useCache, setUseCache] = useState(true);
  const [lastResult, setLastResult] = useState(null);
  const abortControllerRef = useRef(null);

  // Persist sources and queryMode to localStorage
  useEffect(() => { localStorage.setItem("queryPanel:sources", JSON.stringify(sources)); }, [sources]);
  useEffect(() => { localStorage.setItem("queryPanel:queryMode", JSON.stringify(queryMode)); }, [queryMode]);
  useEffect(() => { localStorage.setItem("queryPanel:useReasoner", JSON.stringify(useReasoner)); }, [useReasoner]);
  useEffect(() => { localStorage.setItem("queryPanel:reasoner", JSON.stringify(reasoner)); }, [reasoner]);

  // Initialize sources with podBase when it becomes available
  useEffect(() => {
    if (podBase && sources.length === 0) {
      setSources([podBase]);
    }
  }, [podBase]);

  useEffect(() => {
    const prefixes = { ...DOMAIN_PREFIXES };
    if (podBase) {
      prefixes.pod = podBase;
    }

    if (yasqeRef.current && !yasqeInstance.current) {
      const prefixLines = Object.entries(prefixes)
        .map(([k, v]) => `PREFIX ${k}: <${v}>`)
        .join("\n");

      yasqeInstance.current = new Yasqe(yasqeRef.current, {
        requestConfig: { endpoint: "/query" },
        showQueryButton: false,
        value: `${prefixLines}\n\nSELECT * WHERE {\n  ?s ?p ?o .\n} LIMIT 10`,
      });

      // Register prefixes for autocompletion
      for (const [prefix, iri] of Object.entries(prefixes)) {
        yasqeInstance.current.addPrefixes({ [prefix]: iri });
      }

      // Show prefixes for 2s so students see them, then collapse
      setTimeout(() => {
        if (yasqeInstance.current) {
          yasqeInstance.current.collapsePrefixes(true);
        }
      }, 2000);
    }
    if (yasrRef.current && !yasrInstance.current) {
      yasrInstance.current = new Yasr(yasrRef.current, {
        prefixes: () => {
          // Merge domain prefixes with whatever the user typed in Yasqe
          const queryPrefixes = yasqeInstance.current
            ? yasqeInstance.current.getPrefixesFromQuery()
            : {};
          return { ...prefixes, ...queryPrefixes };
        },
      });
    }
  }, [podBase]);

  async function runQuery() {
    const query = yasqeInstance.current?.getValue()?.trim();
    if (!query) return;

    if (queryMode === "direct" && sources.length === 0) {
      setStatus({ type: "error", message: "Add at least one source URL." });
      return;
    }

    abortControllerRef.current = new AbortController();
    setRunning(true);
    setStatus({ type: "loading", message: "Running query..." });

    const t0 = performance.now();
    try {
      const endpoint = queryMode === "direct" ? "/query-sources" : "/query";
      const body = { query };
      if (queryMode === "direct") {
        body.sources = sources;
      }
      if (queryMode === "link-traversal" && sources.length > 0) {
        body.startSources = sources;
      }
      if (useReasoner && reasoner) {
        body.reasoner = reasoner;
        if (ontology.trim()) body.ontology = ontology.trim();
      }
      if (!useCache) {
        body.invalidateCache = true;
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: abortControllerRef.current.signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Query failed");

      const elapsed = ((performance.now() - t0) / 1000).toFixed(2);
      const count = data.results.bindings.length;
      setStatus({
        type: "ok",
        message: `${count} result(s) in ${elapsed}s`,
      });
      setLastResult({ data, elapsed, count });

      // Reorder head.vars to match the SELECT projection order
      const selectMatch = query.match(/SELECT\s+(DISTINCT\s+)?(.+?)\s*(?:WHERE|\{)/is);
      if (selectMatch && !selectMatch[2].trim().startsWith("*")) {
        const varNames = [...selectMatch[2].matchAll(/\?\w+/g)].map((m) => m[0].slice(1));
        if (varNames.length > 0) {
          const ordered = varNames.filter((v) => data.head.vars.includes(v));
          const remaining = data.head.vars.filter((v) => !ordered.includes(v));
          data.head.vars = [...ordered, ...remaining];
        }
      }

      yasrInstance.current?.setResponse({
        data,
        contentType: "application/sparql-results+json",
        status: 200,
      });
    } catch (e) {
      if (e.name === "AbortError") {
        const elapsed = ((performance.now() - t0) / 1000).toFixed(2);
        setStatus({ type: "error", message: `Query aborted after ${elapsed}s` });
      } else {
        setStatus({ type: "error", message: e.message });
      }
    } finally {
      abortControllerRef.current = null;
      setRunning(false);
    }
  }

  function abortQuery() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }

  function formatOntologyLines(ontos) {
    if (!ontos.length) return [`- **Ontology:** _none_`];
    const isUrl = (name) => /^https?:\/\//.test(name);
    if (ontos.length === 1) {
      const o = ontos[0];
      if (isUrl(o.name)) return [`- **Ontology:** \`${o.name}\``];
      return [`- **Ontology (inline):**`, "", "```turtle", o.content, "```"];
    }
    const lines = [`- **Ontologies (${ontos.length}):**`];
    for (const o of ontos) {
      if (isUrl(o.name)) {
        lines.push(`  - \`${o.name}\``);
      } else {
        lines.push(`  - *${o.name}* (inline):`, "", "```turtle", o.content, "```");
      }
    }
    return lines;
  }

  async function copyOutcome() {
    if (!lastResult) return;
    const query = yasqeInstance.current?.getValue()?.trim() || "";
    const activeSources = sources;
    const timestamp = new Date().toISOString();

    // Build result table
    const vars = lastResult.data.head.vars;
    const bindings = lastResult.data.results.bindings;
    const headerRow = "| " + vars.join(" | ") + " |";
    const separatorRow = "| " + vars.map(() => "---").join(" | ") + " |";
    const dataRows = bindings.map(
      (b) =>
        "| " +
        vars
          .map((v) => {
            const val = b[v];
            if (!val) return "";
            if (val.type === "uri") return `<${val.value}>`;
            return val.value;
          })
          .join(" | ") +
        " |"
    );
    const resultTable =
      bindings.length > 0
        ? [headerRow, separatorRow, ...dataRows].join("\n")
        : "_No results_";

    // Build the markdown document (without signature yet)
    const bodyLines = [
      "# SPARQL Query Outcome",
      "",
      `**Timestamp:** ${timestamp}`,
      "",
      "## Configuration",
      "",
      `- **Query Mode:** ${queryMode === "direct" ? "Direct Sources" : "Link Traversal"}`,
      `- **Sources:** ${activeSources.length > 0 ? activeSources.map((s) => `\`${s}\``).join(", ") : "_none_"}`,
      `- **Reasoning:** ${useReasoner ? "Enabled" : "Disabled"}`,
      ...(useReasoner
        ? [`- **Reasoner:** ${reasoner.toUpperCase()}`, ...formatOntologyLines(ontologies)]
        : []),
      `- **Cache:** ${useCache ? "Enabled" : "Disabled"}`,
      "",
      "## Query",
      "",
      "```sparql",
      query,
      "```",
      "",
      `## Results (${lastResult.count} binding(s) in ${lastResult.elapsed}s)`,
      "",
      resultTable,
      "",
    ];

    const body = bodyLines.join("\n");
    const hash = await computeHash(body);

    const fullDocument = [
      body,
      "---",
      "",
      `**Signature:** \`sha256:${hash}\``,
      "",
      `**Signed at:** ${timestamp}`,
      "",
    ].join("\n");

    await navigator.clipboard.writeText(fullDocument);
    setStatus({
      type: "ok",
      message: `Outcome copied to clipboard (sha256:${hash.slice(0, 12)}...)`,
    });
  }

  return (
    <div>
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <label className="text-sm font-bold uppercase tracking-wide text-black">
              SPARQL Query
            </label>
            <Tooltip text={<>Write a <a href="https://www.w3.org/TR/sparql11-query/" target="_blank" rel="noopener noreferrer">SPARQL</a> SELECT query. Prefixes for common ontologies (<a href="https://www.w3.org/TR/wot-thing-description11/" target="_blank" rel="noopener noreferrer">WoT TD</a>, Workflow, <a href="http://purl.org/net/p-plan" target="_blank" rel="noopener noreferrer">P-Plan</a>, etc.) are pre-loaded. Use the autocompletion for prefix expansion.</>} />
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={useCache}
                onChange={(e) => setUseCache(e.target.checked)}
                className="w-4 h-4 accent-swiss-green"
              />
              <span className="text-sm font-bold uppercase tracking-wide text-black">
                Use Cache
              </span>
              <Tooltip text={<>When enabled, repeated queries reuse previously fetched RDF documents via <a href="https://comunica.dev/docs/query/advanced/caching/" target="_blank" rel="noopener noreferrer">Comunica's HTTP cache</a>. Disable to force fresh fetches from the pod (useful after writing new data).</>} />
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={useReasoner}
                onChange={(e) => setUseReasoner(e.target.checked)}
                className="w-4 h-4 accent-swiss-green"
              />
              <span className="text-sm font-bold uppercase tracking-wide text-black">
                Enable Reasoning
              </span>
              <Tooltip text={<>When enabled, the server applies ontological reasoning (<a href="https://www.w3.org/TR/rdf11-mt/" target="_blank" rel="noopener noreferrer">RDFS</a> or <a href="https://www.w3.org/TR/owl2-profiles/#OWL_2_RL" target="_blank" rel="noopener noreferrer">OWL-RL</a>) on fetched data before answering the query. Load your TBox in the TBox tab first — the reasoner uses it to infer implicit triples (e.g., subclass membership, equivalent classes).</>} />
            </label>
          </div>
        </div>
        <div ref={yasqeRef} className="border-2 border-black" />
      </div>

      {/* Query mode toggle */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <label className="text-sm font-bold uppercase tracking-wide text-black">
            Query Mode
          </label>
          <Tooltip text={<><strong>Direct Sources:</strong> fetches and queries specific RDF documents you list. <strong>Link Traversal:</strong> starts from seed URLs and automatically follows RDF links (owl:sameAs, rdfs:seeAlso, type indexes, etc.) to discover more data — like a web crawler for Linked Data. <a href="https://comunica.dev/docs/query/advanced/solid/" target="_blank" rel="noopener noreferrer">Learn more about Comunica + Solid</a>.</>} />
        </div>
        <div className="flex gap-0">
          {QUERY_MODES.map((mode) => (
            <button
              key={mode.value}
              onClick={() => setQueryMode(mode.value)}
              className={`px-4 py-2 text-sm font-bold uppercase tracking-wide border-2 border-black transition-colors ${
                queryMode === mode.value
                  ? "bg-black text-white"
                  : "bg-white text-black hover:bg-gray-100"
              } ${mode.value === "direct" ? "border-r-0" : ""}`}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      <SourceList
        label={queryMode === "direct" ? "Sources" : "Start Sources"}
        tooltip={<Tooltip text={queryMode === "direct"
          ? <>Explicit RDF document URLs that <a href="https://comunica.dev/docs/query/getting_started/query_cli/" target="_blank" rel="noopener noreferrer">Comunica</a> will fetch and query over. Each source is a URL to a Turtle/RDF document on your Solid pod. Add the exact document URLs that contain the triples you want to query.</>
          : <>Seed URLs where <a href="https://comunica.dev/docs/query/advanced/solid/" target="_blank" rel="noopener noreferrer">Comunica's link traversal</a> begins crawling. The engine follows links (rdfs:seeAlso, owl:sameAs, type indexes, LDP containment) to discover additional data. Typically your pod root URL.</>
        } />}
        sources={sources}
        onAdd={(url) => setSources([...sources, url])}
        onRemove={(i) => setSources(sources.filter((_, j) => j !== i))}
      />

      <div className="flex gap-4 items-end flex-wrap mb-4">
        {useReasoner && (
          <div className="flex items-center gap-2">
            <select
              value={reasoner}
              onChange={(e) => setReasoner(e.target.value)}
              className="border-2 border-black px-3 py-2 text-sm bg-white"
            >
              {REASONERS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <Tooltip text={<><strong>RDFS:</strong> applies subclass/subproperty and domain/range inference (<a href="https://www.w3.org/TR/rdf11-mt/#rdfs-entailment" target="_blank" rel="noopener noreferrer">spec</a>). <strong>OWL-RL:</strong> additionally handles owl:equivalentClass, owl:intersectionOf, owl:someValuesFrom, owl:hasValue, owl:inverseOf, property chains, and more (<a href="https://www.w3.org/TR/owl2-profiles/#OWL_2_RL" target="_blank" rel="noopener noreferrer">spec</a>). Use OWL-RL for the Workflow Ontology exercise.</>} />
          </div>
        )}
        {useReasoner && !ontology.trim() && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-300 px-3 py-1.5 rounded">
            Reasoning is enabled but no TBox is loaded. Go to the <span role="button" tabIndex={0} onClick={() => setActiveTab("TBox")} onKeyDown={(e) => { if (e.key === "Enter") setActiveTab("TBox"); }} className="font-bold underline cursor-pointer hover:text-amber-900">TBox</span> tab to load an ontology.
          </p>
        )}

        {running ? (
          <button
            onClick={abortQuery}
            className="px-6 py-2 text-sm font-bold uppercase tracking-wide text-white bg-red-600 hover:bg-red-700 transition-colors"
          >
            Stop Query
          </button>
        ) : (
          <button
            onClick={runQuery}
            className="px-6 py-2 text-sm font-bold uppercase tracking-wide text-white bg-swiss-green hover:bg-swiss-green-dark transition-colors"
          >
            Run Query
          </button>
        )}

        {lastResult && !running && (
          <button
            onClick={copyOutcome}
            className="px-4 py-2 text-sm font-bold uppercase tracking-wide border-2 border-black hover:bg-black hover:text-white transition-colors"
            title="Copy a signed markdown summary of the query, configuration, and results to your clipboard"
          >
            Copy Outcome
          </button>
        )}
      </div>

      {status && (
        <div
          className={`px-4 py-2 text-sm mb-4 border-l-4 ${
            status.type === "ok"
              ? "bg-swiss-green-light text-swiss-green-dark border-swiss-green"
              : status.type === "error"
              ? "bg-red-50 text-red-800 border-red-600"
              : "bg-yellow-50 text-yellow-800 border-yellow-500"
          }`}
        >
          {status.message}
        </div>
      )}

      <div>
        <div className="flex items-center gap-2 mb-2">
          <label className="text-sm font-bold uppercase tracking-wide text-black">
            Results
          </label>
          <Tooltip text="SPARQL results are displayed below. Use the table/raw tabs to switch views. Click 'Copy Outcome' after running a query to export a signed markdown report with the query, sources, reasoning config, and results." />
        </div>
        <div ref={yasrRef} />
      </div>
    </div>
  );
}
