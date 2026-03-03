import { useState, useEffect, useCallback, useRef } from "react";
import YATE from "perfectkb-yate";
import "perfectkb-yate/dist/yate.min.css";
import Tooltip from "./Tooltip.jsx";

const DOMAIN_PREFIXES = {
  td: "https://www.w3.org/2019/wot/td#",
  jsonschema: "https://www.w3.org/2019/wot/json-schema#",
  wotsec: "https://www.w3.org/2019/wot/security#",
  htv: "http://www.w3.org/2011/http#",
  hctl: "https://www.w3.org/2019/wot/hypermedia#",
  xsd: "http://www.w3.org/2001/XMLSchema#",
  workflow: "https://purl.org/workflow/ontology#",
  "p-plan": "http://purl.org/net/p-plan#",
  ldp: "http://www.w3.org/ns/ldp#",
  quiz: "http://jelenajovanovic.net/ontologies/loco/quiz/ns#",
};

const PREFIX_BLOCK = Object.entries(DOMAIN_PREFIXES)
  .map(([k, v]) => `@prefix ${k}: <${v}> .`)
  .join("\n");

const ACL_PRESETS = [
  { value: "owner", label: "Owner only" },
  { value: "public-read", label: "Public read" },
  { value: "authenticated-rw", label: "Authenticated read/write" },
  { value: "custom", label: "Custom" },
];

function buildAclTurtle(preset, resourceUrl, webId) {
  const prefixes = `@prefix acl: <http://www.w3.org/ns/auth/acl#> .\n@prefix foaf: <http://xmlns.com/foaf/0.1/> .\n\n`;

  const owner = `<#owner>\n    a acl:Authorization ;\n    acl:agent <${webId}> ;\n    acl:accessTo <${resourceUrl}> ;\n    acl:mode acl:Read, acl:Write, acl:Control .\n`;

  if (preset === "owner") {
    return prefixes + owner;
  }
  if (preset === "public-read") {
    return (
      prefixes +
      owner +
      `\n<#public>\n    a acl:Authorization ;\n    acl:agentClass foaf:Agent ;\n    acl:accessTo <${resourceUrl}> ;\n    acl:mode acl:Read .\n`
    );
  }
  if (preset === "authenticated-rw") {
    return (
      prefixes +
      owner +
      `\n<#authenticated>\n    a acl:Authorization ;\n    acl:agentClass acl:AuthenticatedAgent ;\n    acl:accessTo <${resourceUrl}> ;\n    acl:mode acl:Read, acl:Write .\n`
    );
  }
  return "";
}

/**
 * Build a nested tree from flat container/resource pairs.
 */
function buildTree(containers, contents, podBase) {
  const nodeMap = new Map();

  function getOrCreate(url, isContainer) {
    if (nodeMap.has(url)) {
      const node = nodeMap.get(url);
      if (isContainer) node.isContainer = true;
      return node;
    }
    const name = decodeURIComponent(
      url.replace(/\/$/, "").split("/").pop() || url
    );
    const node = { url, name, children: [], isContainer };
    nodeMap.set(url, node);
    return node;
  }

  for (const c of containers) {
    getOrCreate(c, true);
  }

  for (const { container, resource } of contents) {
    const parent = getOrCreate(container, true);
    const child = getOrCreate(resource, resource.endsWith("/"));
    if (!parent.children.find((c) => c.url === child.url)) {
      parent.children.push(child);
    }
  }

  for (const node of nodeMap.values()) {
    node.children.sort((a, b) => {
      if (a.isContainer !== b.isContainer) return a.isContainer ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  const root = nodeMap.get(podBase) || nodeMap.get(podBase.replace(/\/$/, ""));
  if (root) return [root];

  const childUrls = new Set(contents.map((c) => c.resource));
  return [...nodeMap.values()].filter(
    (n) => n.isContainer && !childUrls.has(n.url)
  );
}

function TreeNode({ node, onSelectContainer, selectedContainer, onSelectFile, selectedFile, expandedSet, onToggleExpand, loadingSet }) {
  const expanded = expandedSet.has(node.url);
  const isSelected = selectedContainer === node.url;
  const isLoading = loadingSet && loadingSet.has(node.url);

  if (node.isContainer) {
    return (
      <div>
        <div className="flex items-center">
          <button
            onClick={() => onToggleExpand(node.url)}
            className="text-xs w-5 text-center flex-shrink-0 py-1 hover:bg-gray-100"
          >
            {isLoading ? "\u22EF" : (expanded ? "\u25BC" : "\u25B6")}
          </button>
          <button
            onClick={() => { onSelectContainer(node.url); if (!expanded) onToggleExpand(node.url); }}
            className={`flex items-center gap-1 flex-1 text-left py-1 px-1 text-sm font-mono transition-colors ${
              isSelected
                ? "bg-swiss-green-light text-swiss-green-dark"
                : "hover:bg-gray-100"
            }`}
          >
            <span className="flex-shrink-0">{"\uD83D\uDCC1"}</span>
            <span>{node.name}/</span>
          </button>
        </div>
        {expanded && node.children.length > 0 && (
          <div className="ml-4 border-l border-gray-200">
            {node.children.map((child) => (
              <TreeNode
                key={child.url}
                node={child}
                onSelectContainer={onSelectContainer}
                selectedContainer={selectedContainer}
                onSelectFile={onSelectFile}
                selectedFile={selectedFile}
                expandedSet={expandedSet}
                onToggleExpand={onToggleExpand}
                loadingSet={loadingSet}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const isFileSelected = selectedFile === node.url;
  return (
    <button
      onClick={() => onSelectFile(node.url)}
      className={`flex items-center gap-1 py-1 px-1 ml-5 text-sm font-mono w-full text-left transition-colors ${
        isFileSelected
          ? "bg-swiss-green-light text-swiss-green-dark"
          : "text-gray-600 hover:bg-gray-100 hover:text-black"
      }`}
    >
      <span className="flex-shrink-0">{"\uD83D\uDCC4"}</span>
      <span>{node.name}</span>
    </button>
  );
}

export default function WritePanel({ webId, podBase }) {
  const [selectedContainer, setSelectedContainer] = useState("");
  const [resourceName, setResourceName] = useState("");
  const [manualUrl, setManualUrl] = useState(false);
  const [fullUrl, setFullUrl] = useState("");
  const [mode, setMode] = useState("write");
  const [turtle, setTurtle] = useState("");
  const [status, setStatus] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Edit state
  const [selectedFile, setSelectedFile] = useState(null);
  const [originalTurtle, setOriginalTurtle] = useState("");

  // ACL state
  const [aclPreset, setAclPreset] = useState("owner");
  const [customAcl, setCustomAcl] = useState("");

  // YATE editor refs
  const turtleYateRef = useRef(null);
  const turtleYateInstance = useRef(null);
  const aclYateRef = useRef(null);
  const aclYateInstance = useRef(null);

  // Initialize Turtle data YATE editor
  useEffect(() => {
    if (turtleYateRef.current && !turtleYateInstance.current) {
      turtleYateInstance.current = YATE(turtleYateRef.current, {
        value: turtle || "",
        persistent: null,
      });
      turtleYateInstance.current.on("change", () => {
        setTurtle(turtleYateInstance.current.getValue());
      });
    }
  }, []);

  // Sync external turtle changes (e.g. Insert Prefixes) into YATE
  useEffect(() => {
    if (turtleYateInstance.current && turtleYateInstance.current.getValue() !== turtle) {
      turtleYateInstance.current.setValue(turtle);
    }
  }, [turtle]);

  // Initialize custom ACL YATE editor
  useEffect(() => {
    if (aclPreset === "custom" && aclYateRef.current && !aclYateInstance.current) {
      aclYateInstance.current = YATE(aclYateRef.current, {
        value: customAcl || "",
        persistent: null,
      });
      aclYateInstance.current.on("change", () => {
        setCustomAcl(aclYateInstance.current.getValue());
      });
    }
  }, [aclPreset]);

  // Sync external customAcl changes into ACL YATE
  useEffect(() => {
    if (aclYateInstance.current && aclYateInstance.current.getValue() !== customAcl) {
      aclYateInstance.current.setValue(customAcl);
    }
  }, [customAcl]);

  // Tree state
  const [tree, setTree] = useState([]);
  const [loadingTree, setLoadingTree] = useState(false);
  const [expandedSet, setExpandedSet] = useState(new Set());
  const [loadingSet, setLoadingSet] = useState(new Set());
  const fetchedContainers = useRef(new Set());

  const loadTree = useCallback(() => {
    if (!podBase) return;
    setLoadingTree(true);

    const containersQuery = `PREFIX ldp: <http://www.w3.org/ns/ldp#>\nSELECT ?container WHERE { ?container a ldp:Container . }`;
    const contentsQuery = `PREFIX ldp: <http://www.w3.org/ns/ldp#>\nSELECT ?container ?resource WHERE { ?container ldp:contains ?resource . }`;

    Promise.all([
      fetch("/query-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: containersQuery, sources: [podBase] }),
      }).then((r) => r.json()),
      fetch("/query-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: contentsQuery, sources: [podBase] }),
      }).then((r) => r.json()),
    ])
      .then(([containersData, contentsData]) => {
        const containers = (containersData.results?.bindings || [])
          .map((b) => b.container?.value)
          .filter(Boolean);
        const contents = (contentsData.results?.bindings || [])
          .map((b) => ({
            container: b.container?.value,
            resource: b.resource?.value,
          }))
          .filter((c) => c.container && c.resource);
        setTree(buildTree(containers, contents, podBase));
        // Mark containers whose children we already know about
        fetchedContainers.current = new Set(contents.map((c) => c.container));
        // Auto-select podBase if nothing selected
        if (!selectedContainer && podBase) {
          setSelectedContainer(podBase);
        }
      })
      .catch(() => setTree([]))
      .finally(() => setLoadingTree(false));
  }, [podBase]);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  const isCreatingFolder = resourceName.endsWith("/");

  const computedUrl = manualUrl
    ? fullUrl
    : selectedContainer && resourceName
    ? `${selectedContainer.replace(/\/$/, "")}/${resourceName}`
    : "";

  async function handleSubmit() {
    if (!computedUrl) {
      setStatus({ type: "error", message: "Please specify a target URL." });
      return;
    }
    if (!isCreatingFolder && !turtle.trim()) {
      setStatus({ type: "error", message: "Please provide Turtle data for the resource." });
      return;
    }
    if (computedUrl.includes("/profile/card")) {
      setStatus({ type: "error", message: "Cannot modify profile card." });
      return;
    }

    // Resolve ACL turtle before starting
    const aclTurtle =
      aclPreset === "custom"
        ? customAcl
        : webId
        ? buildAclTurtle(aclPreset, computedUrl, webId)
        : "";

    if (!aclTurtle.trim()) {
      setStatus({ type: "error", message: "ACL content is empty. Configure permissions first." });
      return;
    }

    setSubmitting(true);
    setStatus({ type: "loading", message: "Setting ACL..." });

    try {
      // Step 1: Write ACL first so the resource is protected from creation
      const aclUrl = computedUrl.replace(/\/$/, "") + ".acl";
      const aclRes = await fetch(
        `/write?url=${encodeURIComponent(aclUrl)}`,
        {
          method: "POST",
          headers: { "Content-Type": "text/turtle" },
          body: aclTurtle,
        }
      );
      const aclData = await aclRes.json();
      if (!aclRes.ok) throw new Error(aclData.error || "ACL write failed");

      // Step 2: Create the resource
      setStatus({ type: "loading", message: "Creating resource..." });
      const endpoint = mode === "write" ? "/write" : "/modify";
      const method = mode === "write" ? "POST" : "PUT";
      const res = await fetch(
        `${endpoint}?url=${encodeURIComponent(computedUrl)}`,
        {
          method,
          headers: { "Content-Type": "text/turtle" },
          body: turtle,
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");

      setStatus({ type: "ok", message: `${data.status} at ${data.url} (ACL set)` });
      if (selectedFile) setOriginalTurtle(turtle);
      loadTree();
    } catch (e) {
      setStatus({ type: "error", message: e.message });
    } finally {
      setSubmitting(false);
    }
  }

  function handleToggleExpand(url) {
    setExpandedSet((prev) => {
      const next = new Set(prev);
      if (next.has(url)) {
        next.delete(url);
      } else {
        next.add(url);
        // Lazy-load children if this container hasn't been fetched yet
        if (!fetchedContainers.current.has(url)) {
          fetchContainerChildren(url);
        }
      }
      return next;
    });
  }

  function fetchContainerChildren(containerUrl) {
    fetchedContainers.current.add(containerUrl);
    setLoadingSet((prev) => new Set(prev).add(containerUrl));

    const query = `PREFIX ldp: <http://www.w3.org/ns/ldp#>\nSELECT ?resource WHERE { <${containerUrl}> ldp:contains ?resource . }`;
    fetch("/query-sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, sources: [containerUrl] }),
    })
      .then((r) => r.json())
      .then((data) => {
        const resources = (data.results?.bindings || [])
          .map((b) => b.resource?.value)
          .filter(Boolean);
        if (resources.length > 0) {
          setTree((prev) => {
            const updated = JSON.parse(JSON.stringify(prev));
            addChildrenToNode(updated, containerUrl, resources);
            return updated;
          });
        }
      })
      .catch(() => {})
      .finally(() => {
        setLoadingSet((prev) => {
          const next = new Set(prev);
          next.delete(containerUrl);
          return next;
        });
      });
  }

  function addChildrenToNode(nodes, parentUrl, resources) {
    for (const node of nodes) {
      if (node.url === parentUrl) {
        const existingUrls = new Set(node.children.map((c) => c.url));
        for (const r of resources) {
          if (!existingUrls.has(r)) {
            const name = decodeURIComponent(r.replace(/\/$/, "").split("/").pop() || r);
            node.children.push({ url: r, name, children: [], isContainer: r.endsWith("/") });
          }
        }
        node.children.sort((a, b) => {
          if (a.isContainer !== b.isContainer) return a.isContainer ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
        return true;
      }
      if (node.children.length > 0 && addChildrenToNode(node.children, parentUrl, resources)) {
        return true;
      }
    }
    return false;
  }

  function hasUnsavedChanges() {
    return selectedFile && turtle !== originalTurtle;
  }

  async function handleSelectFile(fileUrl) {
    if (hasUnsavedChanges()) {
      const action = window.confirm(
        "You have unsaved changes. Press OK to discard them, or Cancel to go back and save first."
      );
      if (!action) return;
    }

    setSelectedFile(fileUrl);
    setStatus({ type: "loading", message: "Loading file..." });

    try {
      const res = await fetch(`/read?url=${encodeURIComponent(fileUrl)}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(data.error || "Failed to load file");
      }
      const content = await res.text();
      setTurtle(content);
      setOriginalTurtle(content);
      // Derive container and resource name from file URL
      const parts = fileUrl.replace(/\/$/, "").split("/");
      const fileName = parts.pop();
      const container = parts.join("/") + "/";
      setSelectedContainer(container);
      setResourceName(decodeURIComponent(fileName));
      setManualUrl(false);
      setMode("write");
      setStatus({ type: "ok", message: `Loaded ${decodeURIComponent(fileName)}` });
    } catch (e) {
      setStatus({ type: "error", message: e.message });
    }
  }

  function handleClearEdit() {
    if (hasUnsavedChanges()) {
      const action = window.confirm(
        "You have unsaved changes. Press OK to discard them, or Cancel to go back and save first."
      );
      if (!action) return;
    }

    setSelectedFile(null);
    setOriginalTurtle("");
    setTurtle("");
    setResourceName("");
    setMode("write");
    setStatus(null);
    if (turtleYateInstance.current) {
      turtleYateInstance.current.setValue("");
    }
  }

  const aclPreview =
    aclPreset === "custom"
      ? customAcl
      : computedUrl && webId
      ? buildAclTurtle(aclPreset, computedUrl, webId)
      : "";

  return (
    <div>
      {/* Step 1: Choose where to write */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <label className="text-sm font-bold uppercase tracking-wide text-black">
              1. Choose Location
            </label>
            <Tooltip text={<>Select where on your <a href="https://solidproject.org/about" target="_blank" rel="noopener noreferrer">Solid pod</a> to store the resource. Use the file browser to navigate your pod's container structure, or switch to manual URL entry. Resources are stored as RDF documents inside <a href="https://www.w3.org/TR/ldp/#ldpc" target="_blank" rel="noopener noreferrer">LDP containers</a> (folders).</>} />
          </div>
          <div className="flex items-center gap-2">
            {!manualUrl && (
              <button
                onClick={loadTree}
                disabled={loadingTree}
                className="px-3 py-1 text-xs font-bold uppercase tracking-wide border-2 border-black hover:bg-black hover:text-white transition-colors"
              >
                {loadingTree ? "Loading..." : "Refresh"}
              </button>
            )}
            <button
              onClick={() => setManualUrl(!manualUrl)}
              className="text-sm text-swiss-green underline"
            >
              {manualUrl ? "Use file browser" : "Enter URL manually"}
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-500 mb-2">
          {manualUrl
            ? "Enter the full URL where the resource will be stored."
            : "Select a folder to write into, then name your resource. New folders are created automatically."}
        </p>

        {manualUrl ? (
          <input
            type="text"
            value={fullUrl}
            onChange={(e) => setFullUrl(e.target.value)}
            placeholder="https://pod.example/container/resource"
            className="w-full border-2 border-black px-3 py-2 text-sm font-mono"
          />
        ) : (
          <div>
            {/* Pod tree browser */}
            <div className="flex gap-4 flex-wrap">
              <div className="flex-1 min-w-[250px]">
                <label className="block text-xs text-gray-600 mb-1">
                  Folder (click to select)
                </label>
                {loadingTree ? (
                  <div className="border-2 border-black p-4 text-sm text-gray-500">
                    Loading pod structure...
                  </div>
                ) : tree.length === 0 ? (
                  <div className="border-2 border-black p-4 text-sm text-gray-500">
                    No containers found.
                  </div>
                ) : (
                  <div className="border-2 border-black p-2 max-h-52 overflow-y-auto">
                    {tree.map((node) => (
                      <TreeNode
                        key={node.url}
                        node={node}
                        onSelectContainer={setSelectedContainer}
                        selectedContainer={selectedContainer}
                        onSelectFile={handleSelectFile}
                        selectedFile={selectedFile}
                        expandedSet={expandedSet}
                        onToggleExpand={handleToggleExpand}
                        loadingSet={loadingSet}
                      />
                    ))}
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs text-gray-600 mb-1">
                  Resource name
                </label>
                <input
                  type="text"
                  value={resourceName}
                  onChange={(e) => setResourceName(e.target.value)}
                  placeholder="my-resource"
                  className="w-full border-2 border-black px-3 py-2 text-sm font-mono"
                />
                <p className="text-xs text-gray-400 mt-1">
                  {isCreatingFolder
                    ? "Ends with / \u2014 this will create a new folder (container)."
                    : "Creates a file (resource) inside the selected folder. End with / to create a folder instead."}
                </p>
              </div>
            </div>
          </div>
        )}

        {computedUrl && (
          <div className="mt-2 px-3 py-2 bg-gray-50 border-2 border-black">
            <span className="text-xs text-gray-500">
              {isCreatingFolder ? "New folder: " : "Full URL: "}
            </span>
            <span className="text-sm font-mono break-all">{computedUrl}</span>
          </div>
        )}
      </div>

      {selectedFile && (
        <div className="mb-4 flex items-center gap-2 px-3 py-2 bg-swiss-green-light border-2 border-swiss-green">
          <span className="text-sm font-bold text-swiss-green-dark">
            Editing:
          </span>
          <span className="text-sm font-mono text-swiss-green-dark break-all flex-1">
            {selectedFile.split("/").pop()}
          </span>
          <button
            onClick={handleClearEdit}
            className="px-2 py-1 text-xs font-bold uppercase tracking-wide border-2 border-swiss-green-dark text-swiss-green-dark hover:bg-swiss-green-dark hover:text-white transition-colors"
          >
            Exit Editing
          </button>
        </div>
      )}

      {/* Step 2: Operation */}
      {selectedFile ? (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-1">
            <label className="text-sm font-bold uppercase tracking-wide text-black">
              2. Operation
            </label>
            <Tooltip text="You are editing an existing resource. Submitting will overwrite its entire content with what you have below. This uses an HTTP PUT to the resource URL." />
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Overwrites the existing resource with the content below.
          </p>
        </div>
      ) : (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-1">
            <label className="text-sm font-bold uppercase tracking-wide text-black">
              2. Operation
            </label>
            <Tooltip text={<><strong>Write:</strong> creates a new resource via HTTP PUT (or overwrites if it exists). <strong>Modify:</strong> merges new triples into an existing resource using <a href="https://www.w3.org/TR/sparql11-update/" target="_blank" rel="noopener noreferrer">SPARQL UPDATE</a> — useful for adding data without replacing what's already there.</>} />
          </div>
          <div className="flex gap-0">
            <button
              onClick={() => setMode("write")}
              className={`px-4 py-2 text-sm font-bold uppercase tracking-wide border-2 border-black border-r-0 transition-colors ${
                mode === "write"
                  ? "bg-black text-white"
                  : "bg-white text-black hover:bg-gray-100"
              }`}
            >
              Write
            </button>
            <button
              onClick={() => setMode("modify")}
              className={`px-4 py-2 text-sm font-bold uppercase tracking-wide border-2 border-black transition-colors ${
                mode === "modify"
                  ? "bg-black text-white"
                  : "bg-white text-black hover:bg-gray-100"
              }`}
            >
              Modify
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {mode === "write"
              ? "Creates the resource (or overwrites if it already exists)."
              : "Merges triples into an existing resource (creates it if missing)."}
          </p>
        </div>
      )}

      {/* Step 3: Turtle data */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <label className="text-sm font-bold uppercase tracking-wide text-black">
              3. Turtle Data{isCreatingFolder ? " (optional)" : ""}
            </label>
            <Tooltip text={<>Enter your RDF data in <a href="https://www.w3.org/TR/turtle/" target="_blank" rel="noopener noreferrer">Turtle</a> syntax. Use "Insert Prefixes" to add common namespace prefixes. Subject URIs like {"<#name>"} create fragment identifiers within this document — see the reference table below for how different URI forms resolve.</>} />
          </div>
          <button
            onClick={() => {
              const current = turtle.trim();
              if (current) {
                setTurtle(PREFIX_BLOCK + "\n\n" + current);
              } else {
                setTurtle(PREFIX_BLOCK + "\n\n");
              }
            }}
            className="px-3 py-1 text-xs font-bold uppercase tracking-wide border-2 border-black hover:bg-black hover:text-white transition-colors"
          >
            Insert Prefixes
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-1">
          {isCreatingFolder
            ? "Optional \u2014 leave empty to create an empty folder, or add metadata triples."
            : "RDF triples in Turtle format. See the subject URI reference below."}
        </p>
        <div ref={turtleYateRef} className="border-2 border-black" />
        {!isCreatingFolder && computedUrl && !turtle.trim() && !selectedFile && (
          <div className="mt-2 border-2 border-dashed border-gray-300 bg-gray-50 px-4 py-3 text-xs font-mono text-gray-400 whitespace-pre">{`@prefix was: <${DOMAIN_PREFIXES.was}> .
@prefix schema: <${DOMAIN_PREFIXES.schema}> .

<#example1>
    a was:SomeClass ;
    schema:name "Example" .`}</div>
        )}
        {!isCreatingFolder && computedUrl && (() => {
          const relResolved = (() => {
            try { return new URL("tractor1", computedUrl).href; } catch { return "..."; }
          })();
          const fragResolved = computedUrl + "#tractor1";
          const selfResolved = computedUrl;
          const absExample = "https://example.org/thing1";
          const rows = [
            {
              write: "<#tractor1>",
              resolved: fragResolved,
              desc: "Fragment \u2014 a thing defined inside this document",
              source: computedUrl,
              sourceNote: "this document",
              sparql: `SELECT ?p ?o WHERE {\n  <${fragResolved}> ?p ?o .\n}`,
            },
            {
              write: "<tractor1>",
              resolved: relResolved,
              desc: "Relative \u2014 resolves to a sibling resource (a different document!)",
              source: relResolved,
              sourceNote: "that other document, not this one",
              sparql: `SELECT ?p ?o WHERE {\n  <${relResolved}> ?p ?o .\n}`,
            },
            {
              write: "<>",
              resolved: selfResolved,
              desc: "Self \u2014 the document itself as a subject",
              source: computedUrl,
              sourceNote: "this document",
              sparql: `SELECT ?p ?o WHERE {\n  <${selfResolved}> ?p ?o .\n}`,
            },
            {
              write: `<${absExample}>`,
              resolved: absExample,
              desc: "Absolute \u2014 any external URI, used as-is",
              source: absExample,
              sourceNote: "that external document",
              sparql: `SELECT ?p ?o WHERE {\n  <${absExample}> ?p ?o .\n}`,
            },
          ];
          return (
            <div className="mt-3 border-2 border-gray-200 text-xs">
              <div className="bg-gray-100 px-3 py-2 font-bold uppercase tracking-wide text-gray-600 border-b border-gray-200">
                Subject URI Reference
              </div>
              {rows.map((row, i) => (
                <div key={i} className={`px-3 py-2 ${i < rows.length - 1 ? "border-b border-gray-100" : ""}`}>
                  <div className="flex items-baseline gap-2 mb-1">
                    <code className="font-bold text-black">{row.write}</code>
                    <span className="text-gray-500">{row.desc}</span>
                  </div>
                  <div className="text-gray-400 mb-0.5 break-all">
                    Resolves to: <span className="text-gray-600">{row.resolved}</span>
                  </div>
                  <div className="text-gray-400 mb-1 break-all">
                    Source needed: <span className="text-gray-600 break-all">{row.source}</span>
                    <span className="text-gray-400"> ({row.sourceNote})</span>
                  </div>
                  <pre className="bg-gray-50 border border-gray-200 px-2 py-1.5 font-mono text-gray-600 whitespace-pre overflow-x-auto">{row.sparql}</pre>
                </div>
              ))}
            </div>
          );
        })()}
      </div>

      {/* Step 4: ACL Permissions */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-1">
          <label className="text-sm font-bold uppercase tracking-wide text-black">
            4. Permissions (ACL)
          </label>
          <Tooltip text={<><a href="https://solid.github.io/web-access-control-spec/" target="_blank" rel="noopener noreferrer">Web Access Control (WAC)</a> defines who can read/write your resources. "Public read" makes data queryable by anyone (needed for the exercise). ACL is set before the resource is created so data is never exposed without permissions.</>} />
        </div>
        <p className="text-xs text-gray-500 mb-2">
          ACL is set before the resource is created to ensure it is never exposed without permissions.
        </p>
        <div className="mb-3">
          <select
            value={aclPreset}
            onChange={(e) => setAclPreset(e.target.value)}
            className="border-2 border-black px-3 py-2 text-sm bg-white"
          >
            {ACL_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        {aclPreset === "custom" ? (
          <div className="mb-3">
            <label className="block text-xs text-gray-600 mb-1">
              Custom ACL (Turtle)
            </label>
            <div ref={aclYateRef} className="border-2 border-black" />
          </div>
        ) : aclPreview ? (
          <div className="mb-3">
            <label className="block text-xs text-gray-600 mb-1">
              ACL Preview
            </label>
            <pre className="bg-white border border-gray-300 p-3 text-xs font-mono whitespace-pre-wrap max-h-48 overflow-y-auto">
              {aclPreview}
            </pre>
          </div>
        ) : null}
      </div>

      <button
        onClick={handleSubmit}
        disabled={submitting}
        className={`px-6 py-2 text-sm font-bold uppercase tracking-wide text-white transition-colors ${
          submitting
            ? "bg-gray-400 cursor-not-allowed"
            : "bg-swiss-green hover:bg-swiss-green-dark"
        }`}
      >
        {submitting ? "Submitting..." : "Submit"}
      </button>

      {status && (
        <div
          className={`mt-3 px-4 py-2 text-sm border-l-4 ${
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
    </div>
  );
}
