# SPARQL Query Outcome

**Timestamp:** 2026-03-09T20:09:17.505Z

## Configuration

- **Query Mode:** Link Traversal
- **Sources:** `https://wiser-solid-xi.interactions.ics.unisg.ch/Raphael-G-ntensperger/`
- **Reasoning:** Enabled
- **Reasoner:** OWL-RL
- **Ontology:** `https://wiser-solid-xi.interactions.ics.unisg.ch/Raphael-G-ntensperger/workflows/tbox`
- **Cache:** Enabled

## Query

```sparql
PREFIX workflow: <https://purl.org/workflow/ontology#>
PREFIX td: <https://www.w3.org/2019/wot/td#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

SELECT DISTINCT ?type WHERE {
  ?type rdfs:subClassOf workflow:ToolAction .
  FILTER(?type != workflow:ToolAction)
}
```

## Results (3 binding(s) in 13.77s)

| type |
| --- |
| <https://purl.org/workflow/ontology#WebFetchAction> |
| <https://purl.org/workflow/ontology#TextReplaceAction> |
| <https://purl.org/workflow/ontology#HtmlParseAction> |

---

**Signature:** `sha256:d3c255e0cc7d4ce3dfafcba7b26fa2ccc822f71eb6b14c491d11d5c4878ca4c3`

**Signed at:** 2026-03-09T20:09:17.505Z
