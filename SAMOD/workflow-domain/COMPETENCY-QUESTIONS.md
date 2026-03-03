# Competency Questions — Workflow Ontology

As described in the [Scenario](SCENARIO.md), the provided ontology already infers a generic **ToolAction** from any WoT **ActionAffordance** and supports generic **Workflow** structure. When the competency questions below can be answered, you can be sure that the provided TBox works correctly with the ABox you are going to set up. In a second step, further questions verify that your own TBox extensions integrate correctly as well. 

**Note:** In a real-world SAMOD process, competency questions evolve iteratively — as you model new aspects of the domain, you would add new questions to test them. For this exercise the questions below are sufficient, but keep in mind that extending competency questions is a key part of ontology engineering in practice.

**Note:** The expected outcomes listed below assume all parts of Task 3 are complete (TBox subclasses, Thing Descriptions uploaded, Workflows composed). You do not need to wait until everything is finished to start testing — use these queries incrementally to verify your progress as you complete each part. Partial results are expected and useful for debugging.

| ID | Question in Natural Language | Expected Outcome |
|----|------------------------------|------------------|
| q1 | What are all my available ToolActions? | 6 results of type `workflow:ToolAction` |
| q2 | What are the input and output schemas of a given ToolAction? | 2 results of type `jsonschema:ObjectSchema` per ToolAction |
| q3 | What are the steps of a given Workflow? | 2 results of type `p-plan:Step` per 2-step Workflow |
| q4 | What is the execution order of steps in a Workflow? | 1 result per step pair linked by `p-plan:isPrecededBy` |
| q5 | Which WoT Things offers a specific ToolAction? | At least 1 result of type `td:Thing` per ToolAction subclass |
| q6 | Which ToolActions extend the generic ToolAction with a more specific definition? (i.e. a query to find your extended ToolAction subclasses)| At least 1 result of your ToolAction subclass type (e.g. `workflow:WebFetchAction`) |
| q7 | Which WoT Things have actions that participate in a given Workflow? | e.g. 2 results of type `td:Thing` for a 2-step Workflow |

