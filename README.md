# Exercise 3: Web Ontologies and Knowledge Graphs

This repository contains:
- A partial implementation of a Web ontology for the Workflow domain based on the [SAMOD methodology](https://essepuntato.it/samod/).

For the full exercise description, see [EXERCISE.md](EXERCISE.md).

## Project structure
```
├── SAMOD // the only directory required for Tasks 3.1 and 3.2
│   └── workflow-domain
│       ├── README.md // the description of the Motivating Scenario, including the Competency Questions and the preliminary Glossary of terms
│       ├── tbox.ttl // the preliminary TBox that implements the description of the terms in the glossary
│       └── data
│           ├── abox // example ABox data
│           └── select // queries for testing the knowledge graph based on the competency questions
├── comunica-solid
│   └── ... // Comunica-based server for management of Solid Pods including UI
```


```
cp comunica-solid/.env.example comunica-solid/.env
```

### Option A: Docker Compose

Run the Comunica-based server with [Docker Compose](https://docs.docker.com/compose/):
```
docker compose up --build -d
```

### Option B: Dev Container / GitHub Codespaces

You can open this repository in a [Dev Container](https://containers.dev/) (locally via the [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)) or in [GitHub Codespaces](https://github.com/codespaces). Dependencies are installed and the server is started automatically.

---

In both cases, the Comunica-based server will be available at http://localhost:7200 once ready.
