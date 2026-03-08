# SPARQL Query Outcome

**Timestamp:** 2026-03-08T14:48:58.917Z

## Configuration

- **Query Mode:** Link Traversal
- **Sources:** `https://wiser-solid-xi.interactions.ics.unisg.ch/Raphael-G-ntensperger/`
- **Reasoning:** Enabled
- **Reasoner:** OWL-RL
- **Ontology:** `https://wiser-solid-xi.interactions.ics.unisg.ch/Raphael-G-ntensperger/workflows/tbox`
- **Cache:** Enabled

## Query

```sparql
PREFIX pod: <https://wiser-solid-xi.interactions.ics.unisg.ch/Raphael-G-ntensperger/>
PREFIX quiz: <http://jelenajovanovic.net/ontologies/loco/quiz/ns#>
PREFIX ldp: <http://www.w3.org/ns/ldp#>
PREFIX p-plan: <http://purl.org/net/p-plan#>
PREFIX hctl: <https://www.w3.org/2019/wot/hypermedia#>
PREFIX htv: <http://www.w3.org/2011/http#>
PREFIX wotsec: <https://www.w3.org/2019/wot/security#>
PREFIX jsonschema: <https://www.w3.org/2019/wot/json-schema#>
PREFIX td: <https://www.w3.org/2019/wot/td#>
# q1: What are all the ToolActions?
# Requires OWL-RL reasoning: ToolAction is inferred from ActionAffordance + schemas.

PREFIX workflow: <https://purl.org/workflow/ontology#>

SELECT ?action WHERE {
    ?action a workflow:ToolAction .
}
```

## Results (5 binding(s) in 226.32s)

| action |
| --- |
| <https://wiser-solid-xi.interactions.ics.unisg.ch/Raphael-G-ntensperger/tools/web-fetcher#fetchWebPage> |
| <https://wiser-solid-xi.interactions.ics.unisg.ch/Raphael-G-ntensperger/tools/text-searcher#searchText> |
| <https://wiser-solid-xi.interactions.ics.unisg.ch/Raphael-G-ntensperger/tools/html-parser#parseHtml> |
| <https://wiser-solid-xi.interactions.ics.unisg.ch/Raphael-G-ntensperger/tools/text-replacer#replaceText> |
| <https://wiser-solid-xi.interactions.ics.unisg.ch/Raphael-G-ntensperger/tools/json-filter#filterJson> |

---

**Signature:** `sha256:f32beb8959a6f3f0741b9c9fc764fedab8c07df91fffa060af932972800b7338`

**Signed at:** 2026-03-08T14:48:58.917Z
