import { useState, useEffect } from "react";
import QueryPanel from "./components/QueryPanel.jsx";
import WritePanel from "./components/WritePanel.jsx";
import DeletePanel from "./components/DeletePanel.jsx";
import TBoxPanel from "./components/TBoxPanel.jsx";

const TABS = ["Query", "Write", "Delete", "TBox"];

function podStorageKey(userWebId) {
  return userWebId ? `podBaseOverride:${userWebId}` : null;
}

export default function App() {
  const [activeTab, setActiveTab] = useState("Query");
  const [webId, setWebId] = useState(null);
  const [podBaseOverride, setPodBaseOverride] = useState(null);
  const [editingPod, setEditingPod] = useState(false);
  const [podInput, setPodInput] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);
  const [fullWidth, setFullWidth] = useState(false);
  const [ontologies, setOntologies] = useState([]);
  const [serverPodBase, setServerPodBase] = useState(null);

  // Load user-specific pod override once webId is known
  useEffect(() => {
    if (!webId) return;
    const key = podStorageKey(webId);
    const stored = key && localStorage.getItem(key);
    if (stored) setPodBaseOverride(stored);
  }, [webId]);

  useEffect(() => {
    const checkHealth = () =>
      fetch("/health")
        .then((res) => res.json())
        .then((data) => {
          setLoggedIn(data.loggedIn);
          setWebId(data.webId || null);
          setServerPodBase(data.podBase || null);
          // Only set override from server if no user-specific localStorage override exists
          const key = data.webId ? podStorageKey(data.webId) : null;
          if (!(key && localStorage.getItem(key)) && data.podBase) {
            setPodBaseOverride(data.podBase);
          }
        })
        .catch(() => {
          setLoggedIn(false);
          setWebId(null);
        });

    checkHealth();
    const interval = setInterval(checkHealth, 30_000);
    return () => clearInterval(interval);
  }, []);

  const podBase = podBaseOverride || (webId ? webId.replace(/\/profile\/card#me$/, "/") : null);
  const ontology = ontologies.map((o) => o.content).join("\n");

  return (
    <div
      className={`mx-auto p-6 transition-all ${
        fullWidth ? "max-w-full px-8" : "max-w-7xl"
      }`}
    >
      <header className="mb-6 border-b-2 border-black pb-4">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-black uppercase">
              Web Autonomous Systems
            </h1>
            <p className="text-xs text-gray-500 mt-1">
              A UI wrapper around <a href="https://comunica.dev/" target="_blank" rel="noopener noreferrer" className="underline hover:text-swiss-green">Comunica</a> for querying and managing <a href="https://solidproject.org/" target="_blank" rel="noopener noreferrer" className="underline hover:text-swiss-green">Solid</a> pods with built-in reasoning support. Feel free to use and extend it for your projects.
            </p>
          </div>
          <button
            onClick={() => setFullWidth(!fullWidth)}
            className="px-3 py-1 text-xs font-bold uppercase tracking-wide border-2 border-black hover:bg-black hover:text-white transition-colors"
            title={fullWidth ? "Default width" : "Full width"}
          >
            {fullWidth ? "Collapse" : "Expand"}
          </button>
        </div>
        <div className="mt-3 flex flex-col gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold uppercase tracking-wide text-gray-500 w-10 flex-shrink-0">Pod</span>
            {editingPod ? (
              <div className="flex items-center gap-1 flex-1 min-w-0">
                <input
                  type="text"
                  value={podInput}
                  onChange={(e) => setPodInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const val = podInput.trim().replace(/\/?$/, "/");
                      setPodBaseOverride(val);
                      const key = podStorageKey(webId);
                      if (key) localStorage.setItem(key, val);
                      setEditingPod(false);
                    }
                    if (e.key === "Escape") setEditingPod(false);
                  }}
                  autoFocus
                  className="flex-1 min-w-0 border-2 border-black px-2 py-1 text-xs font-mono"
                  placeholder="https://pod.example/container/"
                />
                <button
                  onClick={() => {
                    const val = podInput.trim().replace(/\/?$/, "/");
                    setPodBaseOverride(val);
                    const key = podStorageKey(webId);
                    if (key) localStorage.setItem(key, val);
                    setEditingPod(false);
                  }}
                  className="px-2 py-1 font-bold border-2 border-black hover:bg-black hover:text-white transition-colors flex-shrink-0"
                >
                  OK
                </button>
                {serverPodBase && (
                  <button
                    onClick={() => {
                      setPodBaseOverride(serverPodBase);
                      const key = podStorageKey(webId);
                      if (key) localStorage.removeItem(key);
                      setEditingPod(false);
                    }}
                    className="px-2 py-1 font-bold border-2 border-black hover:bg-black hover:text-white transition-colors flex-shrink-0"
                  >
                    Reset
                  </button>
                )}
                <button
                  onClick={() => setEditingPod(false)}
                  className="px-2 py-1 text-gray-500 hover:text-black transition-colors flex-shrink-0"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setPodInput(podBase || "");
                  setEditingPod(true);
                }}
                className="font-mono text-left hover:underline truncate"
                title={podBase || "No pod set"}
              >
                {podBase || "not set"}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="font-bold uppercase tracking-wide text-gray-500 w-10 flex-shrink-0">User</span>
            <span
              className={`font-mono ${
                loggedIn ? "text-swiss-green-dark" : "text-red-800"
              }`}
            >
              {loggedIn ? webId : "Not logged in"}
            </span>
          </div>
        </div>
      </header>

      <nav className="flex gap-0 border-b-2 border-black mb-6">
        {TABS.map((tab) => (
          <button
            key={tab}
            className={`px-6 py-3 text-sm font-bold uppercase tracking-wide border-b-2 -mb-[2px] transition-colors ${
              activeTab === tab
                ? "border-swiss-green text-swiss-green bg-swiss-green-light"
                : "border-transparent text-black hover:text-swiss-green"
            }`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </nav>

      <main className="bg-white border-2 border-black p-6">
        {activeTab === "Query" && <QueryPanel podBase={podBase} ontology={ontology} ontologies={ontologies} setActiveTab={setActiveTab} />}
        {activeTab === "Write" && (
          <WritePanel webId={webId} podBase={podBase} />
        )}
        {activeTab === "Delete" && <DeletePanel podBase={podBase} />}
        {activeTab === "TBox" && (
          <TBoxPanel
            ontologies={ontologies}
            setOntologies={setOntologies}
          />
        )}
      </main>

      <footer className="mt-6 border-t border-gray-200 pt-4 text-xs text-gray-400 leading-relaxed">
        <details>
          <summary className="cursor-pointer font-bold uppercase tracking-wide text-gray-500 hover:text-black transition-colors select-none">
            How authentication works
          </summary>
          <div className="mt-2 space-y-2 text-gray-500">
            <p>
              This server authenticates to your Solid pod on your behalf using the{" "}
              <a href="https://solidproject.org/TR/protocol#authentication" target="_blank" rel="noopener noreferrer" className="underline hover:text-swiss-green">
                Solid-OIDC protocol
              </a>.
              It obtains{" "}
              <a href="https://datatracker.ietf.org/doc/html/rfc9449" target="_blank" rel="noopener noreferrer" className="underline hover:text-swiss-green">
                DPoP-bound access tokens
              </a>{" "}
              via the{" "}
              <a href="https://communitysolidserver.github.io/CommunitySolidServer/latest/usage/client-credentials/" target="_blank" rel="noopener noreferrer" className="underline hover:text-swiss-green">
                CSS Client Credentials
              </a>{" "}
              flow and uses them for all pod operations.
            </p>
            <p>
              <strong className="text-gray-600">In a production setting</strong>, you would typically:
            </p>
            <ol className="list-decimal list-inside space-y-1 ml-2">
              <li>
                Redirect users to their Solid identity provider via{" "}
                <a href="https://solidproject.org/TR/oidc" target="_blank" rel="noopener noreferrer" className="underline hover:text-swiss-green">
                  Solid-OIDC
                </a>{" "}
                (an OpenID Connect profile)
              </li>
              <li>
                Handle the OIDC callback to receive an authenticated session with a{" "}
                <a href="https://solidproject.org/TR/protocol#webid" target="_blank" rel="noopener noreferrer" className="underline hover:text-swiss-green">
                  WebID
                </a>
              </li>
              <li>
                Use the session's authenticated <code className="bg-gray-100 px-1 rounded">fetch</code> for all pod requests, governed by{" "}
                <a href="https://solidproject.org/TR/wac" target="_blank" rel="noopener noreferrer" className="underline hover:text-swiss-green">
                  Web Access Control (WAC)
                </a>
              </li>
            </ol>
            <p>
              For this exercise, the server handles authentication via environment variables (<code className="bg-gray-100 px-1 rounded">SOLID_ENDPOINT</code>,{" "}
              <code className="bg-gray-100 px-1 rounded">SOLID_USERNAME</code>,{" "}
              <code className="bg-gray-100 px-1 rounded">SOLID_PASSWORD</code>,{" "}
              <code className="bg-gray-100 px-1 rounded">SOLID_WEBID</code>) and refreshes tokens automatically every 60 seconds.
            </p>
          </div>
        </details>
      </footer>
    </div>
  );
}
