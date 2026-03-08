# SPARQL Query Outcome

**Timestamp:** 2026-03-08T15:04:10.286Z

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
PREFIX hctl: <https://www.w3.org/2019/wot/hypermedia#>
PREFIX htv: <http://www.w3.org/2011/http#>
PREFIX wotsec: <https://www.w3.org/2019/wot/security#>
PREFIX jsonschema: <https://www.w3.org/2019/wot/json-schema#>
PREFIX td: <https://www.w3.org/2019/wot/td#>
# q3: What are the steps of a given Workflow?
# Expected: the individual actions that compose a Workflow, e.g. 2 steps for a 2-step Workflow.

PREFIX workflow: <https://purl.org/workflow/ontology#>
PREFIX p-plan: <http://purl.org/net/p-plan#>

SELECT ?workflow ?step WHERE {
    ?workflow a workflow:Workflow .
    ?step p-plan:isStepOfPlan ?workflow .
}
```

## Results (3 binding(s) in 281.67s)

| workflow | step |
| --- | --- |
| <https://wiser-solid-xi.interactions.ics.unisg.ch/Raphael-G-ntensperger/workflows/fetch-parse-replace#it> | <https://wiser-solid-xi.interactions.ics.unisg.ch/Raphael-G-ntensperger/tools/web-fetcher#fetchWebPage> |
| <https://wiser-solid-xi.interactions.ics.unisg.ch/Raphael-G-ntensperger/workflows/fetch-parse-replace#it> | <https://wiser-solid-xi.interactions.ics.unisg.ch/Raphael-G-ntensperger/tools/html-parser#parseHtml> |
| <https://wiser-solid-xi.interactions.ics.unisg.ch/Raphael-G-ntensperger/workflows/fetch-parse-replace#it> | <https://wiser-solid-xi.interactions.ics.unisg.ch/Raphael-G-ntensperger/tools/text-replacer#replaceText> |

---

**Signature:** `sha256:45c3e958f7e529e4fdd89acfdd36f7dc2ae325788ca28ed270b12c370034a6ed`

**Signed at:** 2026-03-08T15:04:10.286Z
