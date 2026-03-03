const N3 = require("n3");
const {
  createSolidDataset,
  buildThing,
  createThing,
  setThing,
  saveSolidDatasetAt,
  getSolidDataset,
  getThing,
  deleteSolidDataset,
  deleteContainer,
  getContainedResourceUrlAll,
} = require("@inrupt/solid-client");

const XSD = "http://www.w3.org/2001/XMLSchema#";

/**
 * Parses a Turtle string into an array of RDF quads.
 * @param {string} turtle - Turtle-serialized RDF
 * @param {string} [baseIRI] - Optional base IRI for resolving relative URIs (e.g. <#name>)
 * @returns {import("n3").Quad[]}
 */
function parseTurtle(turtle, baseIRI) {
  const parser = new N3.Parser(baseIRI ? { baseIRI } : {});
  return parser.parse(turtle);
}

/**
 * Converts an array of RDF quads into a SolidDataset by grouping them by subject.
 * If a Thing already exists in the dataset (by URI), new properties are merged into it.
 * All subjects are created with their absolute URLs.
 *
 * @param {import("@inrupt/solid-client").SolidDataset} dataset - The dataset to add to
 * @param {import("n3").Quad[]} quads - Parsed RDF quads
 * @returns {import("@inrupt/solid-client").SolidDataset}
 */
function quadsToDataset(dataset, quads) {
  const subjects = new Map();
  for (const quad of quads) {
    const subjectValue = quad.subject.value;
    if (!subjects.has(subjectValue)) {
      subjects.set(subjectValue, []);
    }
    subjects.get(subjectValue).push(quad);
  }

  // First pass: build named things and collect blank node object references
  const blankNodeThings = new Map();

  for (const [subjectUri, subjectQuads] of subjects) {
    const isBlankNode = subjectQuads[0]?.subject.termType === "BlankNode";

    let thing;
    if (isBlankNode) {
      thing = createThing();
    } else {
      const existing = getThing(dataset, subjectUri);
      if (existing) {
        thing = existing;
      } else {
        thing = createThing({ url: subjectUri });
      }
    }

    let builder = buildThing(thing);
    for (const quad of subjectQuads) {
      const predicate = quad.predicate.value;
      const object = quad.object;

      if (object.termType === "NamedNode") {
        builder = builder.addUrl(predicate, object.value);
      } else if (object.termType === "Literal") {
        builder = addTypedLiteral(builder, predicate, object);
      }
      // BlankNode objects are linked after all blank nodes are built
    }
    thing = builder.build();
    dataset = setThing(dataset, thing);

    if (isBlankNode) {
      blankNodeThings.set(subjectUri, thing);
    }
  }

  // Second pass: link blank node objects to their parent subjects
  for (const [subjectUri, subjectQuads] of subjects) {
    const hasBlankObjects = subjectQuads.some((q) => q.object.termType === "BlankNode");
    if (!hasBlankObjects) continue;

    const thingUrl = blankNodeThings.has(subjectUri)
      ? blankNodeThings.get(subjectUri).url
      : subjectUri;
    const existing = getThing(dataset, thingUrl);
    if (!existing) continue;

    let builder = buildThing(existing);
    for (const quad of subjectQuads) {
      if (quad.object.termType === "BlankNode") {
        const bnThing = blankNodeThings.get(quad.object.value);
        if (bnThing) {
          builder = builder.addUrl(quad.predicate.value, bnThing.url);
        }
      }
    }
    dataset = setThing(dataset, builder.build());
  }

  return dataset;
}

/**
 * Adds a typed literal to a ThingBuilder, dispatching to the correct
 * @inrupt/solid-client method based on the XSD datatype.
 *
 * Supported types: xsd:integer, xsd:int, xsd:long, xsd:decimal, xsd:float,
 * xsd:double, xsd:boolean, xsd:dateTime. Everything else is treated as a string.
 *
 * @param {import("@inrupt/solid-client").ThingBuilder} builder
 * @param {string} predicate - The predicate URI
 * @param {import("n3").Literal} literal - The N3 literal term
 * @returns {import("@inrupt/solid-client").ThingBuilder}
 */
function addTypedLiteral(builder, predicate, literal) {
  const datatype = literal.datatype ? literal.datatype.value : null;

  if (datatype === XSD + "integer" || datatype === XSD + "int" || datatype === XSD + "long") {
    return builder.addInteger(predicate, parseInt(literal.value, 10));
  }
  if (datatype === XSD + "decimal" || datatype === XSD + "float" || datatype === XSD + "double") {
    return builder.addDecimal(predicate, parseFloat(literal.value));
  }
  if (datatype === XSD + "boolean") {
    return builder.addBoolean(predicate, literal.value === "true");
  }
  if (datatype === XSD + "dateTime") {
    return builder.addDatetime(predicate, new Date(literal.value));
  }
  return builder.addStringNoLocale(predicate, literal.value);
}

/**
 * Writes (creates or overwrites) a resource in the Solid pod from parsed quads.
 */
async function writeResource(resourceUrl, quads, authFetch) {
  let dataset;
  try {
    dataset = await getSolidDataset(resourceUrl, { fetch: authFetch });
  } catch (fetchErr) {
    dataset = createSolidDataset();
  }
  dataset = quadsToDataset(dataset, quads);

  await saveSolidDatasetAt(resourceUrl, dataset, { fetch: authFetch });
}

/**
 * Modifies (merges into) a resource in the Solid pod from parsed quads.
 */
async function modifyResource(resourceUrl, quads, authFetch) {
  let dataset;
  try {
    dataset = await getSolidDataset(resourceUrl, { fetch: authFetch });
  } catch (fetchErr) {
    dataset = createSolidDataset();
  }
  dataset = quadsToDataset(dataset, quads);

  await saveSolidDatasetAt(resourceUrl, dataset, { fetch: authFetch });
}

/**
 * Deletes a resource from the Solid pod.
 * If the resource is a container, recursively deletes all children first.
 */
async function deleteResource(resourceUrl, authFetch) {
  if (resourceUrl.endsWith("/")) {
    const dataset = await getSolidDataset(resourceUrl, { fetch: authFetch });
    const containedUrls = getContainedResourceUrlAll(dataset);
    for (const childUrl of containedUrls) {
      await deleteResource(childUrl, authFetch);
    }
    await deleteContainer(resourceUrl, { fetch: authFetch });
  } else {
    await deleteSolidDataset(resourceUrl, { fetch: authFetch });
  }
}

/**
 * Recursively lists all resource URLs in a Solid pod container.
 */
async function listPodResources(containerUrl, authFetch) {
  const urls = [containerUrl];
  const dataset = await getSolidDataset(containerUrl, { fetch: authFetch });
  const contained = getContainedResourceUrlAll(dataset);
  for (const childUrl of contained) {
    if (childUrl.endsWith("/")) {
      urls.push(...await listPodResources(childUrl, authFetch));
    } else {
      urls.push(childUrl);
    }
  }
  return urls;
}

module.exports = {
  parseTurtle,
  quadsToDataset,
  writeResource,
  modifyResource,
  deleteResource,
  listPodResources,
};
