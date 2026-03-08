# SPARQL Query Outcome

**Timestamp:** 2026-03-08T15:11:15.587Z

## Configuration

- **Query Mode:** Link Traversal
- **Sources:** `https://wiser-solid-xi.interactions.ics.unisg.ch/Raphael-G-ntensperger/`
- **Reasoning:** Enabled
- **Reasoner:** OWL-RL
- **Ontology:** `https://wiser-solid-xi.interactions.ics.unisg.ch/Raphael-G-ntensperger/workflows/tbox`
- **Cache:** Enabled

## Query

```sparql
# q5: Which Things offer a specific type of ToolAction?
# Expected: At least 1 Thing per ToolAction subclass.
# Replace workflow:WebFetchAction with your own subclass to test different types.

PREFIX workflow: <https://purl.org/workflow/ontology#>
PREFIX td: <https://www.w3.org/2019/wot/td#>

SELECT ?thing ?action WHERE {
    ?thing a td:Thing ;
           td:hasActionAffordance ?action .
    ?action a workflow:WebFetchAction .
}
```

## Results (1 binding(s) in 145.81s)

| thing | action |
| --- | --- |
| <https://wiser-solid-xi.interactions.ics.unisg.ch/Raphael-G-ntensperger/tools/web-fetcher#webFetcherThing> | <https://wiser-solid-xi.interactions.ics.unisg.ch/Raphael-G-ntensperger/tools/web-fetcher#fetchWebPage> |

---

**Signature:** `sha256:2a6e9f8255e3be53d722b0aeb0a0fb3f685be099b82c88b4bee86e0eba3b32cd`

**Signed at:** 2026-03-08T15:11:15.587Z


# SPARQL Query Outcome

**Timestamp:** 2026-03-08T15:22:13.995Z

## Configuration

- **Query Mode:** Link Traversal
- **Sources:** `https://wiser-solid-xi.interactions.ics.unisg.ch/Raphael-G-ntensperger/`
- **Reasoning:** Enabled
- **Reasoner:** OWL-RL
- **Ontology:** `https://wiser-solid-xi.interactions.ics.unisg.ch/Raphael-G-ntensperger/workflows/tbox`
- **Cache:** Enabled

## Query

```sparql
# q5: Which Things offer a specific type of ToolAction?
# Expected: At least 1 Thing per ToolAction subclass.
# Replace workflow:WebFetchAction with your own subclass to test different types.

PREFIX workflow: <https://purl.org/workflow/ontology#>
PREFIX td: <https://www.w3.org/2019/wot/td#>

SELECT ?thing ?action WHERE {
    ?thing a td:Thing ;
           td:hasActionAffordance ?action .
    ?action a workflow:HtmlParseAction .
}
```

## Results (1 binding(s) in 150.78s)

| thing | action |
| --- | --- |
| <https://wiser-solid-xi.interactions.ics.unisg.ch/Raphael-G-ntensperger/tools/html-parser#htmlParserThing> | <https://wiser-solid-xi.interactions.ics.unisg.ch/Raphael-G-ntensperger/tools/html-parser#parseHtml> |

---

**Signature:** `sha256:cf5fec08891ff030975572145ee744ee75bffc6600a17a5c97169c9f99205c55`

**Signed at:** 2026-03-08T15:22:13.995Z
