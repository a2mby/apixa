/**
 * Entity types for every built-in dataset. The single source lives in `@apixa/core`
 * (`MockDatasetCatalog`) so `defineApi` infers them without importing this package.
 */
export type {
  MockUser,
  MockUser as User,
  Product,
  Company,
  Order,
  Post,
  Comment,
  CountryCsc,
  CountryMledoze,
  CountryParseapi,
  CountryCode,
  CapitalCity,
  Currency,
  Language,
  Timezone,
  AreaCode,
} from "@apixa/core";
