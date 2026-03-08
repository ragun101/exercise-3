# SPARQL Query Outcome

**Timestamp:** 2026-03-08T15:07:26.990Z

## Configuration

- **Query Mode:** Link Traversal
- **Sources:** `https://wiser-solid-xi.interactions.ics.unisg.ch/Raphael-G-ntensperger/`
- **Reasoning:** Enabled
- **Reasoner:** OWL-RL
- **Ontology:** `https://wiser-solid-xi.interactions.ics.unisg.ch/Raphael-G-ntensperger/workflows/tbox`
- **Cache:** Enabled

## Query

```sparql
# q4: What is the execution order of steps in a Workflow?
# Expected: 1 result per step pair linked by p-plan:isPrecededBy.

PREFIX workflow: <https://purl.org/workflow/ontology#>
PREFIX p-plan: <http://purl.org/net/p-plan#>

SELECT ?workflow ?step ?predecessorStep WHERE {
    ?workflow a workflow:Workflow .
    ?step p-plan:isStepOfPlan ?workflow .
    ?step p-plan:isPrecededBy ?predecessorStep .
}
```

## Results (2 binding(s) in 173.76s)

| workflow | step | predecessorStep |
| --- | --- | --- |
| <https://wiser-solid-xi.interactions.ics.unisg.ch/Raphael-G-ntensperger/workflows/fetch-parse-replace#it> | <https://wiser-solid-xi.interactions.ics.unisg.ch/Raphael-G-ntensperger/tools/html-parser#parseHtml> | <https://wiser-solid-xi.interactions.ics.unisg.ch/Raphael-G-ntensperger/tools/web-fetcher#fetchWebPage> |
| <https://wiser-solid-xi.interactions.ics.unisg.ch/Raphael-G-ntensperger/workflows/fetch-parse-replace#it> | <https://wiser-solid-xi.interactions.ics.unisg.ch/Raphael-G-ntensperger/tools/text-replacer#replaceText> | <https://wiser-solid-xi.interactions.ics.unisg.ch/Raphael-G-ntensperger/tools/html-parser#parseHtml> |

---

**Signature:** `sha256:1b315fa0c128823c437d9f9fb41b1c1dd9d0976f5bde6831fb1f9f408bfc7c9d`

**Signed at:** 2026-03-08T15:07:26.990Z
