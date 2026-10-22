/**
 * Structural checks for an OpenAPI 3.1 document — enough to catch a broken
 * generator without pulling in a validator dependency. Returns a list of
 * problems (empty = fine). Used by the unit and e2e tests.
 */
export function lintOpenApi(doc: any): string[] {
  const problems: string[] = [];
  if (!doc || typeof doc !== 'object') return ['document is not an object'];
  if (typeof doc.openapi !== 'string' || !/^3\.1\.\d+$/.test(doc.openapi)) problems.push('openapi must be 3.1.x');
  if (!doc.info?.title || !doc.info?.version) problems.push('info.title and info.version are required');
  if (!doc.paths || typeof doc.paths !== 'object') problems.push('paths must be an object');

  const schemas = doc.components?.schemas ?? {};
  const securitySchemes = doc.components?.securitySchemes ?? {};
  const operationIds = new Set<string>();
  const tagNames = new Set<string>();
  for (const t of doc.tags ?? []) {
    if (tagNames.has(t.name)) problems.push(`duplicate tag "${t.name}"`);
    tagNames.add(t.name);
  }

  // Every $ref must point at an existing component.
  const walk = (node: any, where: string) => {
    if (Array.isArray(node)) return node.forEach((n, i) => walk(n, `${where}[${i}]`));
    if (!node || typeof node !== 'object') return;
    if (typeof node.$ref === 'string') {
      const m = /^#\/components\/schemas\/(.+)$/.exec(node.$ref);
      if (!m || !(m[1] in schemas)) problems.push(`${where}: unresolved $ref ${node.$ref}`);
    }
    if (node.discriminator?.mapping) {
      for (const [k, target] of Object.entries<string>(node.discriminator.mapping)) {
        const m = /^#\/components\/schemas\/(.+)$/.exec(target);
        if (!m || !(m[1] in schemas)) problems.push(`${where}: discriminator "${k}" maps to unknown ${target}`);
      }
    }
    if (Array.isArray(node.required) && node.properties && typeof node.properties === 'object') {
      for (const r of node.required) if (!(r in node.properties)) problems.push(`${where}: required "${r}" is not a property`);
    }
    for (const [k, v] of Object.entries(node)) walk(v, `${where}.${k}`);
  };
  walk(doc.paths, 'paths');
  walk(schemas, 'components.schemas');

  for (const [p, item] of Object.entries<any>(doc.paths ?? {})) {
    if (!p.startsWith('/')) problems.push(`path "${p}" must start with /`);
    const templated = [...p.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
    for (const [method, op] of Object.entries<any>(item)) {
      const where = `${method.toUpperCase()} ${p}`;
      if (!['get', 'put', 'post', 'delete', 'patch', 'head', 'options', 'trace'].includes(method)) {
        problems.push(`${where}: unknown method`);
        continue;
      }
      if (!op.responses || !Object.keys(op.responses).length) problems.push(`${where}: no responses`);
      for (const [code, r] of Object.entries<any>(op.responses ?? {})) {
        if (!/^([1-5]\d\d|[1-5]XX|default)$/.test(code)) problems.push(`${where}: bad response code ${code}`);
        if (!r?.description) problems.push(`${where} ${code}: response needs a description`);
      }
      if (!op.operationId) problems.push(`${where}: no operationId`);
      else if (operationIds.has(op.operationId)) problems.push(`${where}: duplicate operationId ${op.operationId}`);
      else operationIds.add(op.operationId);
      for (const t of op.tags ?? []) if (!tagNames.has(t)) problems.push(`${where}: undeclared tag "${t}"`);
      const params: any[] = op.parameters ?? [];
      const seen = new Set<string>();
      for (const prm of params) {
        const key = `${prm.in}:${prm.name}`;
        if (seen.has(key)) problems.push(`${where}: duplicate parameter ${key}`);
        seen.add(key);
        if (!['query', 'header', 'path', 'cookie'].includes(prm.in)) problems.push(`${where}: parameter ${prm.name} has bad "in"`);
        if (prm.in === 'path' && (prm.required !== true || !templated.includes(prm.name))) {
          problems.push(`${where}: path parameter ${prm.name} must be required and in the path`);
        }
      }
      for (const t of templated) {
        if (!params.some((prm) => prm.in === 'path' && prm.name === t)) problems.push(`${where}: {${t}} has no path parameter`);
      }
      for (const req of op.security ?? []) {
        for (const name of Object.keys(req)) if (!(name in securitySchemes)) problems.push(`${where}: unknown security scheme ${name}`);
      }
    }
  }
  return problems;
}
