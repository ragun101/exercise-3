# SPARQL Query Outcome

**Timestamp:** 2026-03-08T14:52:29.637Z

## Configuration

- **Query Mode:** Link Traversal
- **Sources:** `https://wiser-solid-xi.interactions.ics.unisg.ch/Raphael-G-ntensperger/`
- **Reasoning:** Enabled
- **Reasoner:** OWL-RL
- **Ontology:** `https://wiser-solid-xi.interactions.ics.unisg.ch/Raphael-G-ntensperger/workflows/tbox`
- **Cache:** Enabled

## Query

```sparql
# q2: What are the input and output schemas of a given ToolAction?

PREFIX workflow: <https://purl.org/workflow/ontology#>
PREFIX td: <https://www.w3.org/2019/wot/td#>

SELECT ?action ?input ?output WHERE {
    ?action a workflow:ToolAction .
    ?action td:hasInputSchema ?input .
    ?action td:hasOutputSchema ?output .
}
```

## Results (5 binding(s) in 144.14s)

| action | input | output |
| --- | --- | --- |
| <https://wiser-solid-xi.interactions.ics.unisg.ch/Raphael-G-ntensperger/tools/web-fetcher#fetchWebPage> | <https://wiser-solid-xi.interactions.ics.unisg.ch/Raphael-G-ntensperger/tools/web-fetcher#urlSchema> | <https://wiser-solid-xi.interactions.ics.unisg.ch/Raphael-G-ntensperger/tools/web-fetcher#htmlSchema> |
| <https://wiser-solid-xi.interactions.ics.unisg.ch/Raphael-G-ntensperger/tools/html-parser#parseHtml> | <https://wiser-solid-xi.interactions.ics.unisg.ch/Raphael-G-ntensperger/tools/html-parser#htmlInputSchema> | <https://wiser-solid-xi.interactions.ics.unisg.ch/Raphael-G-ntensperger/tools/html-parser#jsonOutputSchema> |
| <https://wiser-solid-xi.interactions.ics.unisg.ch/Raphael-G-ntensperger/tools/text-searcher#searchText> | <https://wiser-solid-xi.interactions.ics.unisg.ch/Raphael-G-ntensperger/tools/text-searcher#textInputSchema> | <https://wiser-solid-xi.interactions.ics.unisg.ch/Raphael-G-ntensperger/tools/text-searcher#textOutputSchema> |
| <https://wiser-solid-xi.interactions.ics.unisg.ch/Raphael-G-ntensperger/tools/text-replacer#replaceText> | <https://wiser-solid-xi.interactions.ics.unisg.ch/Raphael-G-ntensperger/tools/text-replacer#textInputSchema> | <https://wiser-solid-xi.interactions.ics.unisg.ch/Raphael-G-ntensperger/tools/text-replacer#textOutputSchema> |
| <https://wiser-solid-xi.interactions.ics.unisg.ch/Raphael-G-ntensperger/tools/json-filter#filterJson> | <https://wiser-solid-xi.interactions.ics.unisg.ch/Raphael-G-ntensperger/tools/json-filter#jsonInputSchema> | <https://wiser-solid-xi.interactions.ics.unisg.ch/Raphael-G-ntensperger/tools/json-filter#jsonOutputSchema> |

---

**Signature:** `sha256:142ca206c6bdcce7a7380a57ad14500418af781d8576fc142ef82b025f8a8ed6`

**Signed at:** 2026-03-08T14:52:29.637Z
