# Motivating Scenario: A Remote Sandbox Environment for your Agents to use

In this task, you will extend a small ontology for describing tool capabilities as Linked Data, composing them into multi-step **Workflows**, and letting an OWL reasoner infer the rest. It is a simplified but concrete version of the challenge that the AI industry is grappling with right now.

## Why sandboxing?

Agent Skills are becoming a standard way for LLM agents to discover and execute tools. But one inherent danger of skills is that they are essentially **remote code execution by design**: the agent reads an instruction and executes it, typically with the same privileges as the user. A [recent audit of 2,890+ agent skills found that 41.7% contain serious security vulnerabilities](https://blogs.cisco.com/ai/personal-ai-agents-like-openclaw-are-a-security-nightmare). You probably don't want an LLM agent running arbitrary skills on *your* machine.

One way to address this is **remote sandboxing**: instead of letting the agent run arbitrary code on your computer, you give it access to an isolated machine. The simplest version of this is just SSH into a remote box, but that still gives the agent a shell and all the problems that come with it. A more principled approach is to formally describe what the sandbox can do. In this exercise, we use **Thing Descriptions (TDs)** from the [W3C Web of Things](https://www.w3.org/WoT/) standard for this. Each tool on the sandbox is described as a WoT **Thing** that declares which **ActionAffordances** it supports, what inputs it expects (via **hasInputSchema**), and what outputs it produces (via **hasOutputSchema**). The schemas use **contentMediaType** to declare the IANA media type of the data (e.g., `"text/html"`, `"application/json"`). The agent could only interact through these declared interfaces, never through raw shell access.

## The Sandbox Computer

In this exercise our hypothetical sandbox computer has **5 WoT Things** installed, each exposing a single **ActionAffordance**:

| Thing | ActionAffordance | What it does | Input contentMediaType | Output contentMediaType |
|------|--------|-------------|-------|--------|
| **WebFetcher** | `fetchWebPage` | Fetches content from a URL via HTTP GET | `text/uri-list` | `text/html` |
| **JsonFilter** | `filterJson` | Filters and transforms JSON data using an expression | `application/json` | `application/json` |
| **TextSearcher** | `searchText` | Searches text content using a regex pattern | `text/plain` | `text/plain` |
| **TextReplacer** | `replaceText` | Performs find-and-replace on text content | `text/plain` | `text/plain` |
| **HtmlParser** | `parseHtml` | Parses HTML using CSS selectors and outputs structured JSON | `text/html` | `application/json` |


## Composing ActionAffordances into Workflows

Using Thing Descriptions for tool calling would improve security (the agent can only invoke declared interfaces, not arbitrary code) at the cost of some speed and overhead. But can we maybe add some sauce to the system to make it even more attractive?

Consider a concrete task: *"Find every email address on a web page."* No single tool in the sandbox can do this alone, but three of them can be chained together, much like Unix commands in a pipeline: first `fetchWebPage` retrieves the HTML, then `parseHtml` extracts the text content, then `searchText` matches email addresses with a regex. What if we could describe the chain itself as a formal, reusable artifact?

The provided ontology already solves part of this. A **Workflow** is modelled as a **Plan** (reusing the [P-Plan](https://www.opmw.org/model/p-plan/) ontology), where individual **Steps** are linked to the plan via **isStepOfPlan** and ordered with **isPrecededBy**. Each step is a **ToolAction** — a semantic interface that is callable, composable, and reasoner-friendly. The ontology also already infers a generic **ToolAction** from any WoT **ActionAffordance** that declares **hasInputSchema** and **hasOutputSchema** with some value.

What is still missing are **specific ToolAction subclasses** that constrain **hasInputSchema** and **hasOutputSchema** to explicit media types — for example, a `HtmlToJsonAction` that requires `text/html` input and produces `application/json` output. Without these specific definitions, the reasoner cannot verify that the output of one step matches the input of the next, making it impossible to validate or automatically compose workflows. This is where you come in: extend the ontology with specific ToolAction types and their explicit schema linkages, and create concrete Workflow instances that chain these specific ToolActions into multi-step plans — so that workflows for complex tasks can be described, validated, and composed.
