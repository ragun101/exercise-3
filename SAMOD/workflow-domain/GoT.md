# Glossary of Terms (GoT) — Workflow Ontology

This glossary defines the terms used in the Workflow Ontology domain. Each term corresponds to a class, property, or concept that appears in the TBox or ABox.

**Note:** In a real-world SAMOD process, the glossary grows iteratively as new motivating scenarios introduce new terms. For this exercise the glossary below covers the provided scenario, but keep in mind that maintaining and extending a glossary is a key part of ontology engineering in practice.

## Classes

| Term | Definition |
|------|-----------|
| **ToolAction** | An action that has both an input schema and an output schema. |
| **Workflow** | A plan whose steps are all ToolActions. |
| **ActionAffordance** | An interaction affordance (from W3C WoT TD) that allows invoking a function on a Thing. This is an external class reused from the TD vocabulary. |
| **Thing** | A physical or virtual entity accessible over the Web, described by a Thing Description (from W3C WoT TD). |
| **Plan** | A composite entity (from P-Plan) whose steps form an ordered workflow. Inferred via `rdfs:range` of `p-plan:isStepOfPlan`. |
| **Step** | An individual action within a plan (from P-Plan). Inferred via `rdfs:domain` of `p-plan:isStepOfPlan`. |
| **DataSchema** | A schema describing the data format of an action's input or output (from W3C WoT TD). ObjectSchema is a subclass. |
| **ObjectSchema** | A JSON Schema object (from W3C WoT JSON Schema) describing the structure and media type of action input/output data. |

## Properties

| Term | Definition | Domain | Range |
|------|-----------|--------|-------|
| **hasInputSchema** | Links an action to the schema describing its expected input data. | ActionAffordance | DataSchema |
| **hasOutputSchema** | Links an action to the schema describing its output data. | ActionAffordance | DataSchema |
| **hasActionAffordance** | Links a Thing to an ActionAffordance it offers. | Thing | ActionAffordance |
| **contentMediaType** | The IANA media type of the data described by a schema (e.g., `"application/json"`, `"text/html"`). This is the key property used by the reasoner to classify ToolAction subclasses. | DataSchema | xsd:string[^1] |
| **isStepOfPlan** | Links a step to the plan it belongs to. The `rdfs:domain` is `p-plan:Step` and `rdfs:range` is `p-plan:Plan`, which allows the reasoner to infer types. | Step | Plan |
| **isPrecededBy** | Defines the execution order between steps in a plan (step B is preceded by step A). | Step | Step |

[^1]: [`xsd:string`](https://www.w3.org/TR/xmlschema-2/#string) is an XSD datatype, not a class defined in this ontology.

## External Vocabularies

| Prefix | Namespace | Description |
|--------|-----------|-------------|
| `td:` | `https://www.w3.org/2019/wot/td#` | W3C Web of Things Thing Description |
| `jsonschema:` | `https://www.w3.org/2019/wot/json-schema#` | W3C WoT JSON Schema vocabulary |
| `p-plan:` | `http://purl.org/net/p-plan#` | P-Plan ontology for scientific workflows |
| `workflow:` | `https://purl.org/workflow/ontology#` | The Workflow Ontology (this project's core TBox) |
| `wotsec:` | `https://www.w3.org/2019/wot/security#` | WoT Security vocabulary |
| `hctl:` | `https://www.w3.org/2019/wot/hypermedia#` | WoT Hypermedia Controls vocabulary |
