import { useState, useRef, useEffect } from "react";
import YATE from "perfectkb-yate";
import "perfectkb-yate/dist/yate.min.css";
import Tooltip from "./Tooltip.jsx";

let nextId = 1;

export default function TBoxPanel({ ontologies, setOntologies }) {
  const fileInputRef = useRef(null);
  const yateRef = useRef(null);
  const yateInstance = useRef(null);
  const [editorContent, setEditorContent] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [fetchingUrl, setFetchingUrl] = useState(false);
  const [fetchError, setFetchError] = useState(null);

  useEffect(() => {
    if (yateRef.current && !yateInstance.current) {
      yateInstance.current = YATE(yateRef.current, {
        value: "",
        persistent: null,
      });
      yateInstance.current.on("change", () => {
        setEditorContent(yateInstance.current.getValue());
      });
    }
  }, []);

  function addOntology(name, content) {
    setOntologies((prev) => [...prev, { id: nextId++, name, content }]);
  }

  function removeOntology(id) {
    setOntologies((prev) => prev.filter((o) => o.id !== id));
  }

  function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      addOntology(file.name, evt.target.result);
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  async function handleFetchUrl() {
    const url = urlInput.trim();
    if (!url) return;
    setFetchingUrl(true);
    setFetchError(null);
    try {
      const res = await fetch(`/read?url=${encodeURIComponent(url)}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || `Failed to fetch (${res.status})`);
      }
      const turtle = await res.text();
      addOntology(url, turtle);
      setUrlInput("");
    } catch (e) {
      setFetchError(e.message);
    } finally {
      setFetchingUrl(false);
    }
  }

  function handleAddFromEditor() {
    const content = editorContent.trim();
    if (!content) return;
    addOntology("Manual entry", content);
    if (yateInstance.current) yateInstance.current.setValue("");
    setEditorContent("");
  }

  function handleClearAll() {
    setOntologies([]);
    setUrlInput("");
    setFetchError(null);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <label className="text-sm font-bold uppercase tracking-wide text-black">
            TBox (Turtle)
          </label>
          <Tooltip text={<>Load your ontology (<a href="https://www.w3.org/TR/owl2-overview/" target="_blank" rel="noopener noreferrer">TBox</a>) here in <a href="https://www.w3.org/TR/turtle/" target="_blank" rel="noopener noreferrer">Turtle</a> format. When "Enable Reasoning" is checked in the Query tab, this ontology is used by the reasoner to infer implicit triples — e.g., classifying instances via owl:equivalentClass restrictions. You can load multiple ontologies — they will be merged. Upload a local .ttl file, fetch one from a URL (including your <a href="https://solidproject.org/about" target="_blank" rel="noopener noreferrer">Solid pod</a>), or write one directly in the editor below.</>} />
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".ttl,.owl,.rdf,.n3,.nt"
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1 text-xs font-bold uppercase tracking-wide border-2 border-black hover:bg-black hover:text-white transition-colors"
          >
            Upload file
          </button>
          {ontologies.length > 0 && (
            <button
              onClick={handleClearAll}
              className="px-3 py-1 text-xs font-bold uppercase tracking-wide border-2 border-red-600 text-red-600 hover:bg-red-600 hover:text-white transition-colors"
            >
              Clear All
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-2 mb-2">
        <input
          type="text"
          value={urlInput}
          onChange={(e) => { setUrlInput(e.target.value); setFetchError(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleFetchUrl(); } }}
          placeholder="https://pod.example/ontology.ttl"
          className="flex-1 border-2 border-black px-3 py-2 text-sm font-mono"
        />
        <button
          onClick={handleFetchUrl}
          disabled={fetchingUrl || !urlInput.trim()}
          className={`px-4 py-2 text-sm font-bold uppercase tracking-wide border-2 border-black transition-colors ${
            fetchingUrl || !urlInput.trim()
              ? "bg-gray-200 text-gray-400 cursor-not-allowed"
              : "hover:bg-black hover:text-white"
          }`}
        >
          {fetchingUrl ? "Loading..." : "Fetch"}
        </button>
      </div>
      {fetchError && (
        <div className="mb-2 px-3 py-2 text-xs bg-red-50 text-red-800 border-l-4 border-red-600">
          {fetchError}
        </div>
      )}

      {ontologies.length > 0 && (
        <div className="mb-3 space-y-1">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
            Loaded ontologies ({ontologies.length})
          </p>
          {ontologies.map((o) => (
            <div
              key={o.id}
              className="flex items-center justify-between px-3 py-1.5 border border-gray-300 bg-gray-50 text-sm"
            >
              <span className="font-mono text-xs break-all" title={o.name}>
                {o.name}
              </span>
              <button
                onClick={() => removeOntology(o.id)}
                className="ml-2 text-red-500 hover:text-red-800 font-bold text-xs flex-shrink-0"
                title="Remove"
              >
                x
              </button>
            </div>
          ))}
        </div>
      )}

      <div ref={yateRef} className="border-2 border-black" />
      <div className="mt-2 flex items-center justify-between">
        <button
          onClick={handleAddFromEditor}
          disabled={!editorContent.trim()}
          className={`px-4 py-1.5 text-xs font-bold uppercase tracking-wide border-2 border-black transition-colors ${
            !editorContent.trim()
              ? "bg-gray-200 text-gray-400 cursor-not-allowed"
              : "hover:bg-black hover:text-white"
          }`}
        >
          Add from editor
        </button>
        {ontologies.length > 0 && (
          <p className="text-xs text-gray-500">
            These ontologies will be used when "Enable Reasoning" is checked in the Query tab.
          </p>
        )}
      </div>
    </div>
  );
}
