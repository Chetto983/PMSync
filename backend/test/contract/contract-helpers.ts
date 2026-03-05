/**
 * Contract Test Helpers
 *
 * Utilities for loading the OpenAPI spec and validating
 * that frontend API module expectations match backend schemas.
 */
import * as fs from 'fs';
import * as path from 'path';

export interface OpenApiSpec {
  openapi: string;
  paths: Record<string, Record<string, PathItem>>;
  components?: {
    schemas?: Record<string, SchemaObject>;
  };
}

interface PathItem {
  responses?: Record<string, ResponseObject>;
  requestBody?: {
    content?: Record<string, { schema?: SchemaObject }>;
  };
  parameters?: Array<{ name: string; in: string; required?: boolean }>;
}

interface ResponseObject {
  description?: string;
  content?: Record<string, { schema?: SchemaObject }>;
}

interface SchemaObject {
  type?: string;
  properties?: Record<string, SchemaObject>;
  items?: SchemaObject;
  required?: string[];
  $ref?: string;
  allOf?: SchemaObject[];
  oneOf?: SchemaObject[];
  anyOf?: SchemaObject[];
}

/**
 * Load the OpenAPI spec from known locations.
 * Returns null if the spec file is not found (tests should skip gracefully).
 */
export function loadSpec(): OpenApiSpec | null {
  const candidates = [
    path.resolve(__dirname, '../../openapi-spec.json'),
    path.resolve(__dirname, '../../../openapi-spec.json'),
    path.resolve(__dirname, '../../../backend/openapi-spec.json'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      try {
        const raw = fs.readFileSync(candidate, 'utf-8');
        return JSON.parse(raw) as OpenApiSpec;
      } catch {
        console.warn(`Failed to parse OpenAPI spec at ${candidate}`);
        return null;
      }
    }
  }

  console.warn(
    'OpenAPI spec not found at any known location. Contract tests will be skipped.\n' +
    'Generate it with: cd backend && npx ts-node scripts/generate-openapi.ts',
  );
  return null;
}

/**
 * Assert that a path+method combination exists in the spec.
 */
export function expectPathExists(
  spec: OpenApiSpec,
  apiPath: string,
  method: string,
): void {
  const pathEntry = spec.paths[apiPath];
  expect(pathEntry).toBeDefined();
  if (!pathEntry) return;

  const methodLower = method.toLowerCase();
  expect(pathEntry[methodLower]).toBeDefined();
}

/**
 * Resolve a $ref string to the actual schema object.
 * Handles `#/components/schemas/SomeName`.
 */
export function resolveRef(spec: OpenApiSpec, ref: string): SchemaObject | undefined {
  const parts = ref.replace('#/', '').split('/');
  let current: any = spec; // eslint-disable-line @typescript-eslint/no-explicit-any
  for (const part of parts) {
    current = current?.[part];
  }
  return current as SchemaObject | undefined;
}

/**
 * Get the effective schema for a response, resolving $ref and allOf.
 */
export function getResponseSchema(
  spec: OpenApiSpec,
  apiPath: string,
  method: string,
  statusCode: string,
): SchemaObject | undefined {
  const pathEntry = spec.paths[apiPath];
  if (!pathEntry) return undefined;

  const operation = pathEntry[method.toLowerCase()];
  if (!operation) return undefined;

  const response = operation.responses?.[statusCode];
  if (!response) return undefined;

  const content = response.content?.['application/json'];
  if (!content?.schema) return undefined;

  return resolveSchema(spec, content.schema);
}

/**
 * Recursively resolve $ref and allOf in a schema.
 */
function resolveSchema(spec: OpenApiSpec, schema: SchemaObject): SchemaObject {
  if (schema.$ref) {
    const resolved = resolveRef(spec, schema.$ref);
    return resolved ? resolveSchema(spec, resolved) : schema;
  }

  if (schema.allOf) {
    const merged: SchemaObject = { type: 'object', properties: {}, required: [] };
    for (const sub of schema.allOf) {
      const resolved = resolveSchema(spec, sub);
      if (resolved.properties) {
        merged.properties = { ...merged.properties, ...resolved.properties };
      }
      if (resolved.required) {
        merged.required = [...(merged.required || []), ...resolved.required];
      }
    }
    return merged;
  }

  return schema;
}

/**
 * Assert that a response schema has the expected fields.
 * Checks that all listed fields exist as properties in the response schema.
 */
export function expectResponseHasFields(
  spec: OpenApiSpec,
  apiPath: string,
  method: string,
  statusCode: string,
  fields: string[],
): void {
  const schema = getResponseSchema(spec, apiPath, method, statusCode);
  expect(schema).toBeDefined();
  if (!schema) return;

  const resolvedSchema = resolveSchema(spec, schema);
  const properties = resolvedSchema.properties || {};

  for (const field of fields) {
    expect(properties).toHaveProperty(
      field,
      expect.anything(),
    );
  }
}
