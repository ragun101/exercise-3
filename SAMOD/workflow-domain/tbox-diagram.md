# Workflow Ontology — TBox Diagram

The Workflow ontology extends [W3C Web of Things (WoT) Thing Descriptions](https://www.w3.org/TR/wot-thing-description/) and [P-Plan](http://purl.org/net/p-plan#) to model composable tool actions. An **ActionAffordance** from a WoT Thing Description becomes a **ToolAction** when it has typed input and output schemas (see [GoT.md](GoT.md) for full definitions of all classes and properties). ToolActions can be composed into **Workflows** using P-Plan's `isStepOfPlan` and `isPrecededBy` properties. Because a Workflow is itself a ToolAction, workflows can be nested inside other workflows — enabling the recursive composability described in the [motivating scenario](SCENARIO.md).

```mermaid
graph TB
    Thing(["td:Thing"])
    AA(["td:ActionAffordance"])
    DS(["td:DataSchema"])
    TA(["workflow:ToolAction"])
    WF(["workflow:Workflow"])
    Literal["xsd:string"]

    Thing -->|"td:hasActionAffordance"| AA
    AA -->|"td:hasInputSchema"| DS
    AA -->|"td:hasOutputSchema"| DS
    DS -->|"td:contentMediaType"| Literal
    AA -.->|"rdfs:subClassOf"| TA
    WF -.->|"rdfs:subClassOf"| TA
    WF -.->|"td:hasInputSchema"| DS
    WF -.->|"td:hasOutputSchema"| DS
    TA -->|"p-plan:isStepOfPlan"| WF
    TA -->|"p-plan:isPrecededBy"| TA

    style Thing fill:#c9dfef,stroke:#336,color:#000
    style AA fill:#c9dfef,stroke:#336,color:#000
    style DS fill:#c9dfef,stroke:#336,color:#000
    style TA fill:#aad4a5,stroke:#363,color:#000
    style WF fill:#aad4a5,stroke:#363,color:#000
    style Literal fill:#fff2cc,stroke:#996,color:#000
```

## Example: Composable Workflows

The diagram below shows how the ontology enables recursive composability. Three WoT Things each expose an ActionAffordance. When an ActionAffordance declares both an input and output schema (with a `contentMediaType`), the reasoner classifies it as a **ToolAction**. ToolAction 1 and ToolAction 2 are then composed into Workflow 1 using `isStepOfPlan` and ordered with `isPrecededBy` (see [GoT.md — Properties](GoT.md#properties)). Since Workflow 1 is itself a ToolAction (ToolAction 4 — it declares its own schemas), it can be composed with ToolAction 3 into Workflow 2. This nesting can continue indefinitely: any Workflow that declares schemas becomes a ToolAction and can serve as a step in a higher-level Workflow.

```mermaid
graph TB
    subgraph Thing1["td:Thing 1"]
        AA1(["td:ActionAffordance 1"])
    end
    subgraph Thing2["td:Thing 2"]
        AA2(["td:ActionAffordance 2"])
    end
    subgraph Thing3["td:Thing 3"]
        AA3(["td:ActionAffordance 3"])
    end

    AA1 -.->|"rdf:type"| TA1(["workflow:ToolAction 1"])
    AA2 -.->|"rdf:type"| TA2(["workflow:ToolAction 2"])
    AA3 -.->|"rdf:type"| TA3(["workflow:ToolAction 3"])

    TA1 -->|"p-plan:isStepOfPlan"| WF1(["workflow:Workflow 1"])
    TA2 -->|"p-plan:isStepOfPlan"| WF1
    TA2 -->|"p-plan:isPrecededBy"| TA1

    WF1 -.->|"rdf:type"| TA4(["workflow:ToolAction 4"])

    TA4 -->|"p-plan:isStepOfPlan"| WF2(["workflow:Workflow 2"])
    TA3 -->|"p-plan:isStepOfPlan"| WF2
    TA3 -->|"p-plan:isPrecededBy"| TA4

    style AA1 fill:#c9dfef,stroke:#336,color:#000
    style AA2 fill:#c9dfef,stroke:#336,color:#000
    style AA3 fill:#c9dfef,stroke:#336,color:#000
    style TA1 fill:#aad4a5,stroke:#363,color:#000
    style TA2 fill:#aad4a5,stroke:#363,color:#000
    style TA3 fill:#aad4a5,stroke:#363,color:#000
    style TA4 fill:#aad4a5,stroke:#363,color:#000
    style WF1 fill:#aad4a5,stroke:#363,color:#000
    style WF2 fill:#aad4a5,stroke:#363,color:#000
```
