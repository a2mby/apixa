/**
 * Entity types for every dataset `defineMockApi()` can load.
 * Shapes mirror the real `datasets/<domain>/<id>/data.json` records (not the looser
 * `meta.json` schema hints). `catalog.ts` type-checks each JSON file against these.
 */
export type { User } from "./users.js";
export type { MockUser } from "./users-mock.js";

export type Product = {
  id: string;
  title: string;
  description: string;
  price: number;
  brand: string;
  category: string;
  stock: number;
};

export type Company = {
  id: string;
  name: string;
  catchPhrase: string;
  countryCode: string;
};

export type Order = {
  id: string;
  userId: string;
  productId: string;
  companyId: string;
  quantity: number;
  total: number;
  status: string;
};

export type Post = {
  id: string;
  title: string;
  body: string;
  userId: string;
  tags: string[];
};

export type Comment = {
  id: string;
  body: string;
  postId: string;
  userId: string;
};

export type CountryCsc = {
  id: string;
  name: string;
  iso2: string;
  iso3: string;
  numeric_code: string;
  phonecode: string;
  capital: string;
  currency: string;
  region: string;
  subregion: string;
  latitude: string;
  longitude: string;
};

export type CountryMledoze = {
  id: string;
  name: string;
  official: string;
  cca2: string;
  cca3: string;
  ccn3: string;
  region: string;
  subregion: string;
  capital: string | null;
  currencies: string[];
  languages: string[];
  latlng: number[];
};

export type CountryParseapi = {
  country: string;
  iso3: string;
  numeric: number;
  name: string;
  name_local: string | null;
  capital: string | null;
  continent: string;
  region: string;
  subregion: string;
  demonym: string | null;
  languages: string[];
  currency: string;
  tld: string | null;
  calling_code: string;
  emoji: string | null;
  population: number;
  area: number;
};

export type CountryCode = {
  id: string;
  alpha2: string;
  alpha3: string;
  numeric: string;
  name: string;
  region: string;
  currency: string;
};

export type CapitalCity = {
  id: string;
  name: string;
  country_id: string;
  country_code: string;
  country_name: string;
  is_capital: boolean;
  latitude: string;
  longitude: string;
};

export type Currency = {
  currency: string;
  numeric: number | null;
  name: string;
  symbol: string;
  digits: number;
  countries: string[];
};

export type Language = {
  language: string;
  iso3: string;
  name: string;
  name_local: string | null;
  script: string | null;
  direction: string;
  countries: string[];
};

export type Timezone = {
  timezone: string;
  name: string | null;
  abbreviation: string;
  offset: string;
  offset_minutes: number;
  dst: boolean;
};

export type AreaCode = {
  area_code: string;
  country: string;
  state: string;
  state_name: string;
};
