# SPARQL Query Outcome

**Timestamp:** 2026-03-08T17:31:00.071Z

## Configuration

- **Query Mode:** Link Traversal
- **Sources:** `https://wiser-solid-xi.interactions.ics.unisg.ch/Raphael-G-ntensperger/`
- **Reasoning:** Enabled
- **Reasoner:** OWL-RL
- **Ontology:** `https://wiser-solid-xi.interactions.ics.unisg.ch/Raphael-G-ntensperger/workflows/tbox`
- **Cache:** Disabled

## Query

```sparql
# q7: Which WoT Things have actions that participate in a given Workflow?
# Expected: e.g. 2 results of type td:Thing for a 2-step Workflow.
# Requires OWL-RL reasoning to infer Workflow type.

PREFIX workflow: <https://purl.org/workflow/ontology#>
PREFIX p-plan: <http://purl.org/net/p-plan#>
PREFIX td: <https://www.w3.org/2019/wot/td#>

SELECT ?workflow ?thing ?action WHERE {
    ?workflow a workflow:Workflow .
    ?action p-plan:isStepOfPlan ?workflow .
    ?thing a td:Thing ;
           td:hasActionAffordance ?action .
}
```

## Results (3 binding(s) in 1164.49s)

| workflow | thing | action |
| --- | --- | --- |
| <https://wiser-solid-xi.interactions.ics.unisg.ch/Raphael-G-ntensperger/workflows/fetch-parse-replace#it> | <https://wiser-solid-xi.interactions.ics.unisg.ch/Raphael-G-ntensperger/tools/web-fetcher#webFetcherThing> | <https://wiser-solid-xi.interactions.ics.unisg.ch/Raphael-G-ntensperger/tools/web-fetcher#fetchWebPage> |
| <https://wiser-solid-xi.interactions.ics.unisg.ch/Raphael-G-ntensperger/workflows/fetch-parse-replace#it> | <https://wiser-solid-xi.interactions.ics.unisg.ch/Raphael-G-ntensperger/tools/text-replacer#textReplacerThing> | <https://wiser-solid-xi.interactions.ics.unisg.ch/Raphael-G-ntensperger/tools/text-replacer#replaceText> |
| <https://wiser-solid-xi.interactions.ics.unisg.ch/Raphael-G-ntensperger/workflows/fetch-parse-replace#it> | <https://wiser-solid-xi.interactions.ics.unisg.ch/Raphael-G-ntensperger/tools/html-parser#htmlParserThing> | <https://wiser-solid-xi.interactions.ics.unisg.ch/Raphael-G-ntensperger/tools/html-parser#parseHtml> |

---

**Signature:** `sha256:d799541ee3a137b91c895b4a922eaf455c514c2c2594be31e3d68d4669642767`

**Signed at:** 2026-03-08T17:31:00.071Z
