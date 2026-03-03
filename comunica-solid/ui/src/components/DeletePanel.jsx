import { useState, useEffect, useCallback } from "react";

function isProtectedUrl(url, podBase) {
  if (!podBase || !url) return false;
  const trimmed = url.replace(/\/+$/, "");
  const normalizedPod = podBase.replace(/\/+$/, "");
  const profileCard = podBase + "profile/card";
  return trimmed === normalizedPod || trimmed === profileCard;
}

/**
 * Build a nested tree from flat { container, resource } pairs.
 * Each node: { url, name, children: [], isContainer }
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

  // Register all containers
  for (const c of containers) {
    getOrCreate(c, true);
  }

  // Register all resources and parent them
  for (const { container, resource } of contents) {
    const parent = getOrCreate(container, true);
    const child = getOrCreate(resource, resource.endsWith("/"));
    if (!parent.children.find((c) => c.url === child.url)) {
      parent.children.push(child);
    }
  }

  // Sort children: containers first, then alphabetically
  for (const node of nodeMap.values()) {
    node.children.sort((a, b) => {
      if (a.isContainer !== b.isContainer) return a.isContainer ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  // Find root(s) — nodes whose URL is podBase or not contained by another node
  const root = nodeMap.get(podBase) || nodeMap.get(podBase.replace(/\/$/, ""));
  if (root) return [root];

  // Fallback: return top-level containers
  const childUrls = new Set(contents.map((c) => c.resource));
  return [...nodeMap.values()].filter(
    (n) => n.isContainer && !childUrls.has(n.url)
  );
}

function TreeNode({ node, podBase, onSelect, selectedUrl }) {
  const [expanded, setExpanded] = useState(false);
  const [lazyChildren, setLazyChildren] = useState(null);
  const [lazyLoading, setLazyLoading] = useState(false);
  const prot = isProtectedUrl(node.url, podBase);
  const isSelected = selectedUrl === node.url;

  const children = node.children.length > 0 ? node.children : lazyChildren;

  function handleToggle() {
    if (!expanded && node.children.length === 0 && lazyChildren === null && !lazyLoading) {
      setLazyLoading(true);
      const query = `PREFIX ldp: <http://www.w3.org/ns/ldp#>\nSELECT ?resource WHERE { <${node.url}> ldp:contains ?resource . }`;
      fetch("/query-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, sources: [node.url] }),
      })
        .then((r) => r.json())
        .then((data) => {
          const resources = (data.results?.bindings || [])
            .map((b) => b.resource?.value)
            .filter(Boolean);
          setLazyChildren(
            resources.map((url) => ({
              url,
              name: decodeURIComponent(url.replace(/\/$/, "").split("/").pop() || url),
              children: [],
              isContainer: url.endsWith("/"),
            }))
          );
        })
        .catch(() => setLazyChildren([]))
        .finally(() => setLazyLoading(false));
    }
    setExpanded(!expanded);
  }

  if (node.isContainer) {
    return (
      <div>
        <div className="flex items-center">
          <button
            onClick={handleToggle}
            className={`flex items-center gap-1 flex-1 text-left py-1 px-1 text-sm font-mono transition-colors ${
              isSelected ? "bg-red-50 text-red-800" : "hover:bg-gray-100"
            }`}
            title={node.url}
          >
            <span className="text-xs w-4 text-center flex-shrink-0">
              {expanded ? "\u25BC" : "\u25B6"}
            </span>
            <span className="flex-shrink-0">
              {prot ? "\uD83D\uDD12" : "\uD83D\uDCC1"}
            </span>
            <span>{node.name}/</span>
          </button>
          {!prot && (
            <button
              onClick={() => onSelect(node.url)}
              className={`flex-shrink-0 px-1.5 py-0.5 text-xs transition-colors ${
                isSelected
                  ? "text-red-600 font-bold"
                  : "text-gray-400 hover:text-red-500"
              }`}
              title="Select for deletion"
            >
              &#x2716;
            </button>
          )}
        </div>
        {expanded && (
          <div className="ml-4 border-l border-gray-200">
            {lazyLoading ? (
              <div className="py-1 px-2 text-xs text-gray-400 italic">loading...</div>
            ) : children && children.length > 0 ? (
              children.map((child) => (
                <TreeNode
                  key={child.url}
                  node={child}
                  podBase={podBase}
                  onSelect={onSelect}
                  selectedUrl={selectedUrl}
                />
              ))
            ) : (
              <div className="py-1 px-2 text-xs text-gray-400 italic">empty</div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={() => !prot && onSelect(node.url)}
      disabled={prot}
      className={`flex items-center gap-1 w-full text-left py-1 px-2 text-sm font-mono transition-colors ${
        prot
          ? "text-gray-400 cursor-not-allowed"
          : isSelected
          ? "bg-red-50 text-red-800"
          : "hover:bg-gray-100"
      }`}
      title={prot ? "Protected resource" : node.url}
    >
      <span className="text-xs w-4 flex-shrink-0" />
      <span className="flex-shrink-0">{prot ? "\uD83D\uDD12" : "\uD83D\uDCC4"}</span>
      <span>{node.name}</span>
    </button>
  );
}

export default function DeletePanel({ podBase }) {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [tree, setTree] = useState([]);
  const [loading, setLoading] = useState(false);
  const [manualMode, setManualMode] = useState(false);

  const trimmedUrl = url.trim();
  const isFolder = trimmedUrl.endsWith("/");
  const prot = isProtectedUrl(trimmedUrl, podBase);

  const protectedReason = prot
    ? trimmedUrl === podBase?.replace(/\/+$/, "")
      ? "Cannot delete the pod root."
      : "Cannot delete the profile card."
    : null;

  const loadTree = useCallback(() => {
    if (!podBase) return;
    setLoading(true);

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
      })
      .catch(() => setTree([]))
      .finally(() => setLoading(false));
  }, [podBase]);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  function handleSelect(resourceUrl) {
    setUrl(resourceUrl);
  }

  async function handleDelete() {
    if (!trimmedUrl) {
      setStatus({ type: "error", message: "Please enter a resource URL." });
      return;
    }
    if (prot) return;
    if (!confirm(`Delete ${isFolder ? "folder and all its contents" : "resource"} at ${trimmedUrl}?`)) return;

    setDeleting(true);
    setStatus({ type: "loading", message: "Deleting..." });

    try {
      const res = await fetch(
        `/delete?url=${encodeURIComponent(trimmedUrl)}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      setStatus({ type: "ok", message: `Deleted: ${data.url}` });
      setUrl("");
      // Refresh tree after deletion
      loadTree();
    } catch (e) {
      setStatus({ type: "error", message: e.message });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      {/* Pod file browser */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-bold uppercase tracking-wide text-black">
            Pod Contents
          </label>
          <div className="flex items-center gap-2">
            <button
              onClick={loadTree}
              disabled={loading}
              className="px-3 py-1 text-xs font-bold uppercase tracking-wide border-2 border-black hover:bg-black hover:text-white transition-colors"
            >
              {loading ? "Loading..." : "Refresh"}
            </button>
            <button
              onClick={() => setManualMode(!manualMode)}
              className="text-sm text-swiss-green underline"
            >
              {manualMode ? "Use file browser" : "Enter URL manually"}
            </button>
          </div>
        </div>

        {manualMode ? (
          <div>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://pod.example/container/resource"
              className="w-full border-2 border-black px-3 py-2 text-sm font-mono"
            />
          </div>
        ) : loading ? (
          <div className="border-2 border-black p-4 text-sm text-gray-500">
            Loading pod structure...
          </div>
        ) : tree.length === 0 ? (
          <div className="border-2 border-black p-4 text-sm text-gray-500">
            No resources found in pod.
          </div>
        ) : (
          <div className="border-2 border-black p-2 max-h-80 overflow-y-auto">
            {tree.map((node) => (
              <TreeNode
                key={node.url}
                node={node}
                podBase={podBase}
                onSelect={handleSelect}
                selectedUrl={trimmedUrl}
              />
            ))}
          </div>
        )}
      </div>

      {/* Selected resource display */}
      {trimmedUrl && (
        <div className="mb-4">
          <label className="block text-xs text-gray-600 mb-1">Selected resource</label>
          <div className="px-3 py-2 text-sm font-mono bg-gray-50 border-2 border-black break-all">
            {trimmedUrl}
          </div>
          {prot && (
            <div className="mt-2 px-4 py-2 text-sm border-l-4 bg-red-50 text-red-800 border-red-600">
              {protectedReason}
            </div>
          )}
        </div>
      )}

      <button
        onClick={handleDelete}
        disabled={deleting || prot || !trimmedUrl}
        className={`px-6 py-2 text-sm font-bold uppercase tracking-wide text-white transition-colors ${
          deleting || prot || !trimmedUrl
            ? "bg-gray-400 cursor-not-allowed"
            : "bg-red-600 hover:bg-red-700"
        }`}
      >
        {deleting ? "Deleting..." : "Delete Resource"}
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
