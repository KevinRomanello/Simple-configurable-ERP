// The body of a webhook written by the person who makes it, like NocoDB's Handlebars templates:
//   {"text": "{{record.fields.Name}} is now {{record.fields.State}}", "all": {{json record.fields}}}
//   {{#each record.fields.Area}}{{this.name}}{{#unless @last}}, {{/unless}}{{/each}}
//   {{#if previous}}changed{{else}}new{{/if}}
// {{path}} writes the value as text, {{json path}} as JSON. No code runs: only paths are read.

export class TemplateError extends Error {}

type Node =
  | { k: "text"; v: string }
  | { k: "value"; path: string; json: boolean }
  | { k: "each"; path: string; body: Node[] }
  | { k: "if"; path: string; negate: boolean; yes: Node[]; no: Node[] };

const TAG = /{{\s*([#/]?)\s*([^{}]*?)\s*}}/g;

function parse(src: string): Node[] {
  const root: Node[] = [];
  // the open blocks, each with where its nodes go now
  const stack: { node: Extract<Node, { k: "each" } | { k: "if" }>; into: Node[] }[] = [];
  const out = () => stack[stack.length - 1]?.into ?? root;
  let last = 0;
  for (const m of src.matchAll(TAG)) {
    if (m.index! > last) out().push({ k: "text", v: src.slice(last, m.index) });
    last = m.index! + m[0].length;
    const [, mark, body] = m as unknown as [string, string, string];
    const [word, ...rest] = body.split(/\s+/);
    if (mark === "#") {
      const path = rest.join(" ");
      if (!path) throw new TemplateError(`{{#${word}}} needs a value`);
      if (word === "each") {
        const node: Node = { k: "each", path, body: [] };
        out().push(node);
        stack.push({ node, into: node.body });
      } else if (word === "if" || word === "unless") {
        const node: Node = { k: "if", path, negate: word === "unless", yes: [], no: [] };
        out().push(node);
        stack.push({ node, into: node.yes });
      } else throw new TemplateError(`Unknown block {{#${word}}}`);
    } else if (mark === "/") {
      const open = stack.pop();
      if (!open || (open.node.k === "each" ? "each" : open.node.negate ? "unless" : "if") !== word) throw new TemplateError(`{{/${word}}} closes nothing`);
    } else if (word === "else") {
      const open = stack[stack.length - 1];
      if (!open || open.node.k !== "if") throw new TemplateError("{{else}} outside {{#if}}");
      open.into = open.node.no;
    } else if (word === "json") {
      out().push({ k: "value", path: rest.join(" "), json: true });
    } else {
      out().push({ k: "value", path: body, json: false });
    }
  }
  if (stack.length > 0) throw new TemplateError("A block is not closed");
  if (last < src.length) root.push({ k: "text", v: src.slice(last) });
  return root;
}

/** The parts of a path: `record.fields.[Full Name]`, `items.[0].name`, `this`, `@index`. */
const partsOf = (path: string) => [...path.matchAll(/\[([^\]]*)]|[^.[\]]+/g)].map((m) => m[1] ?? m[0]);

interface Scope {
  data: unknown;
  self: unknown;
  index?: number;
  last?: boolean;
  parent?: Scope;
}

function lookup(path: string, scope: Scope): unknown {
  const parts = partsOf(path.trim());
  if (parts[0] === "@index") return scope.index;
  if (parts[0] === "@last") return scope.last;
  let value: unknown = parts[0] === "this" ? scope.self : scope.self !== undefined && typeof scope.self === "object" && scope.self !== null && parts[0]! in scope.self ? scope.self : scope.data;
  for (const part of parts[0] === "this" ? parts.slice(1) : parts) {
    if (value === null || typeof value !== "object") return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}

const truthy = (v: unknown) => !(v === undefined || v === null || v === false || v === "" || v === 0 || (Array.isArray(v) && v.length === 0));
const asText = (v: unknown): string => (v === undefined || v === null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));

function render(nodes: Node[], scope: Scope): string {
  let out = "";
  for (const node of nodes) {
    if (node.k === "text") out += node.v;
    else if (node.k === "value") out += node.json ? JSON.stringify(lookup(node.path, scope) ?? null) : asText(lookup(node.path, scope));
    else if (node.k === "if") out += render(truthy(lookup(node.path, scope)) !== node.negate ? node.yes : node.no, scope);
    else {
      const list = lookup(node.path, scope);
      const items = Array.isArray(list) ? list : list && typeof list === "object" ? Object.values(list) : [];
      items.forEach((item, index) => (out += render(node.body, { data: scope.data, self: item, index, last: index === items.length - 1, parent: scope })));
    }
  }
  return out;
}

/** Checks a template when it is saved; throws TemplateError with a sentence for people. */
export function checkTemplate(src: string): void {
  parse(src);
}

/** The body of a webhook from its template and the event (what is sent when there is no template). */
export function renderTemplate(src: string, data: unknown): string {
  return render(parse(src), { data, self: undefined });
}
