import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { copyFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";

function copyOntologies() {
  const files = [
    {
      src: resolve(__dirname, "../../SAMOD/workflow-domain/tbox.ttl"),
      dest: "ontologies/tbox.ttl",
    },
  ];
  return {
    name: "copy-ontologies",
    buildStart() {
      const pubDir = resolve(__dirname, "public");
      for (const { src, dest } of files) {
        const target = resolve(pubDir, dest);
        mkdirSync(dirname(target), { recursive: true });
        copyFileSync(src, target);
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), copyOntologies()],
  server: {
    proxy: {
      "/query-sources": "http://localhost:7200",
      "/query": "http://localhost:7200",
      "/write": "http://localhost:7200",
      "/modify": "http://localhost:7200",
      "/delete": "http://localhost:7200",
      "/health": "http://localhost:7200",
    },
  },
  build: {
    outDir: "dist",
  },
});
