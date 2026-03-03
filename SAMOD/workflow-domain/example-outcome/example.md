# SPARQL Query Outcome

**Timestamp:** 2026-03-04T05:44:27.625Z

## Configuration

- **Query Mode:** Link Traversal
- **Sources:** `https://wiser-solid-xi.interactions.ics.unisg.ch/my-test-pod/`
- **Reasoning:** Enabled
- **Reasoner:** OWL-RL
- **Ontology:** `https://wiser-solid-xi.interactions.ics.unisg.ch/my-test-pod/tbox`
- **Cache:** Enabled

## Query

```sparql
PREFIX pod: <https://wiser-solid-xi.interactions.ics.unisg.ch/my-test-pod/>
PREFIX quiz: <http://jelenajovanovic.net/ontologies/loco/quiz/ns#>
PREFIX ldp: <http://www.w3.org/ns/ldp#>
PREFIX p-plan: <http://purl.org/net/p-plan#>
PREFIX hctl: <https://www.w3.org/2019/wot/hypermedia#>
PREFIX htv: <http://www.w3.org/2011/http#>
PREFIX wotsec: <https://www.w3.org/2019/wot/security#>
PREFIX jsonschema: <https://www.w3.org/2019/wot/json-schema#>
PREFIX td: <https://www.w3.org/2019/wot/td#>
PREFIX workflow: <https://purl.org/workflow/ontology#>

SELECT ?action WHERE {
    ?action a workflow:ToolAction .
}
```

## Results (4 binding(s) in 14.51s)

| action |
| --- |
| <https://wiser-solid-xi.interactions.ics.unisg.ch/my-test-pod/skills/web-fetcher#fetchWebPage> |
| <https://wiser-solid-xi.interactions.ics.unisg.ch/my-test-pod/skills/html-parser#parseHtml> |
| <https://wiser-solid-xi.interactions.ics.unisg.ch/my-test-pod/skills/text-replacer#replaceText> |
| <https://wiser-solid-xi.interactions.ics.unisg.ch/my-test-pod/skills/json-filter#filterJson> |

---

**Signature:** `sha256:942f2462d419dd8ee119d21b4c402d81f574df170568be50f0f68b68fede2f5d`

**Signed at:** 2026-03-04T05:44:27.625Z
