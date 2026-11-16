// `apixa/validation`: Zod-friendly `defineApi`. Re-exports the canonical `@apixa/validation`
// implementation; Zod is an optional peer dependency that only this entry loads.
export { defineApi, z } from "@apixa/validation";
export type {
  ResolveConfig,
  ResolveShape,
  SchemaDeclaration,
  SchemaShape,
  ShorthandOperationSchema,
} from "@apixa/validation";
