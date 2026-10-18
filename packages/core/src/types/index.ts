export type {
  HttpMethod,
  PathParams,
  QueryParams,
  HeadersInitLike,
} from "./http.js";

import { type as typeMarker } from "./marker.js";
export { typeMarker as type };
export type { Type, Infer } from "./marker.js";

export type {
  RequestConfig,
  ApiResponse,
  TransportRequest,
  TransportResponse,
  Transport,
  RequestOptions,
} from "./transport.js";

export type {
  OperationDefinition,
  ResourceDefinition,
  ReservedApiConfigKey,
  ApiRootConfig,
  ResolvedApiConfig,
  ResolvedResourceConfig,
  ResolvedOperation,
} from "./definition.js";

export type {
  BuiltinOpName,
  EffectivePath,
  EffectiveOps,
  ResourceOpsOf,
  ResourceClient,
  ApiClient,
  ValidateApiConfig,
} from "./inference.js";
