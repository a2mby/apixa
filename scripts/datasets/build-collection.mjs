#!/usr/bin/env node
/**
 * Build local mock datasets from the fixed source URL list (issue #23).
 * Run from repo root: `node scripts/datasets/build-collection.mjs`
 *
 * - Imports CC0 / ODbL-redistributable JSON only
 * - Generates deterministic synthetic data (Faker seed 230523) for unclear licenses
 * - Writes datasets/<domain>/<id>/{meta.json,data.json} + datasets/manifest.json
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const DATASETS = join(ROOT, "datasets");
const CACHE = join(ROOT, "scripts/datasets/.cache");
const SEED = 230523;

const manifest = [];
const skipped = [];

async function ensureDir(p) {
  await mkdir(p, { recursive: true });
}

async function fetchTo(url, dest) {
  await ensureDir(dirname(dest));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
  return dest;
}

async function fetchJson(url, cacheName) {
  const dest = join(CACHE, cacheName);
  try {
    return JSON.parse(await readFile(dest, "utf8"));
  } catch {
    await fetchTo(url, dest);
    return JSON.parse(await readFile(dest, "utf8"));
  }
}

async function writeDataset({
  domain,
  id,
  title,
  description,
  license,
  version,
  sourceUrl,
  attribution,
  origin, // imported | generated
  resourcePath,
  idField = "id",
  records,
  notes,
  substitutes,
}) {
  const dir = join(DATASETS, domain, id);
  await ensureDir(dir);
  const schemaFields =
    records.length > 0
      ? Object.keys(records[0])
          .slice(0, 24)
          .map((name) => ({
            name,
            type:
              typeof records[0][name] === "number"
                ? "number"
                : Array.isArray(records[0][name])
                  ? "array"
                  : typeof records[0][name] === "object" && records[0][name] !== null
                    ? "object"
                    : "string",
          }))
      : [{ name: idField, type: "string" }];

  const meta = {
    id,
    title,
    description,
    license,
    version,
    resource: { path: resourcePath, idField },
    schema: { fields: schemaFields },
    records: records.length,
  };
  await writeFile(join(dir, "meta.json"), JSON.stringify(meta, null, 2) + "\n");
  await writeFile(join(dir, "data.json"), JSON.stringify(records, null, 2) + "\n");

  const rel = relative(DATASETS, dir).replace(/\\/g, "/");
  const entry = {
    id,
    name: title,
    description,
    sourceUrl,
    license,
    attribution,
    recordCount: records.length,
    filePath: `${rel}/data.json`,
    metaPath: `${rel}/meta.json`,
    domain,
    origin,
    notes: notes ?? null,
    substitutes: substitutes ?? null,
  };
  manifest.push(entry);
  console.log(`✓ ${rel} (${records.length} records, ${origin})`);
  return entry;
}

function skip(sourceUrl, reason) {
  skipped.push({ sourceUrl, reason });
  console.log(`⊘ skipped: ${sourceUrl}\n  → ${reason}`);
}

/** Mulberry32 PRNG for deterministic generation without a hard dep if faker missing. */
function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

async function main() {
  await ensureDir(CACHE);
  await ensureDir(DATASETS);

  // --- Preserve / relocate users-sample ---
  const legacySample = join(DATASETS, "users-sample");
  try {
    const meta = JSON.parse(await readFile(join(legacySample, "meta.json"), "utf8"));
    const data = JSON.parse(await readFile(join(legacySample, "data.json"), "utf8"));
    await writeDataset({
      domain: "users",
      id: "users-sample",
      title: meta.title ?? "Users sample",
      description: meta.description ?? "Small directory of example users for Apixa demos.",
      license: meta.license ?? "MIT",
      version: meta.version ?? "1.0.0",
      sourceUrl: "https://github.com/a2mby/apixa",
      attribution: "Apixa maintainers (original sample).",
      origin: "generated",
      resourcePath: "/users",
      records: data,
      notes: "Original Apixa sample; relocated under users/.",
    });
    await rm(legacySample, { recursive: true, force: true });
  } catch {
    await writeDataset({
      domain: "users",
      id: "users-sample",
      title: "Users sample",
      description: "Small directory of example users for Apixa demos.",
      license: "MIT",
      version: "1.0.0",
      sourceUrl: "https://github.com/a2mby/apixa",
      attribution: "Apixa maintainers (original sample).",
      origin: "generated",
      resourcePath: "/users",
      records: [
        { id: "1", name: "Ada Lovelace", email: "ada@example.com" },
        { id: "2", name: "Grace Hopper", email: "grace@example.com" },
      ],
    });
  }

  // --- 4–10 parseapi/lists (CC0-1.0) ---
  const parseapiBase = "https://raw.githubusercontent.com/parseapi/lists/main";
  const parseapiLicense = "CC0-1.0";
  const parseapiAttr =
    "Data from parseapi/lists (https://github.com/parseapi/lists), Creative Commons Zero v1.0 Universal.";

  const parseapiSets = [
    {
      file: "countries/countries.json",
      domain: "geography",
      id: "countries-parseapi",
      title: "Countries (parseapi)",
      path: "/countries",
      idField: "country",
    },
    {
      file: "states/states.json",
      domain: "geography",
      id: "states-parseapi",
      title: "States (parseapi)",
      path: "/states",
      idField: "state",
    },
    {
      file: "counties/counties.json",
      domain: "geography",
      id: "counties-parseapi",
      title: "US Counties (parseapi)",
      path: "/counties",
      idField: "name",
    },
    {
      file: "languages/languages.json",
      domain: "reference",
      id: "languages-parseapi",
      title: "Languages (parseapi)",
      path: "/languages",
      idField: "language",
    },
    {
      file: "timezones/timezones.json",
      domain: "reference",
      id: "timezones-parseapi",
      title: "Time zones (parseapi)",
      path: "/timezones",
      idField: "timezone",
    },
    {
      file: "currencies/currencies.json",
      domain: "reference",
      id: "currencies-parseapi",
      title: "Currencies (parseapi)",
      path: "/currencies",
      idField: "currency",
    },
    {
      file: "area-codes/area-codes.json",
      domain: "reference",
      id: "area-codes-parseapi",
      title: "US Area codes (parseapi)",
      path: "/area-codes",
      idField: "area_code",
    },
  ];

  for (const set of parseapiSets) {
    const url = `${parseapiBase}/${set.file}`;
    const rows = await fetchJson(url, `parseapi-${set.id}.json`);
    if (!Array.isArray(rows)) throw new Error(`${url} is not an array`);
    // Normalize id field presence for registry CRUD demos
    const records = rows.map((row, i) => {
      const r = { ...row };
      if (r[set.idField] == null && r.id == null) {
        r.id = String(i + 1);
      }
      return r;
    });
    await writeDataset({
      domain: set.domain,
      id: set.id,
      title: set.title,
      description: `Imported from parseapi/lists ${set.file}`,
      license: parseapiLicense,
      version: "1.0.0",
      sourceUrl: url,
      attribution: parseapiAttr,
      origin: "imported",
      resourcePath: set.path,
      idField: set.idField,
      records,
    });
  }

  // --- 1 CSC countries + slim states + capital cities (ODbL) ---
  const cscCountriesUrl =
    "https://raw.githubusercontent.com/dr5hn/countries-states-cities-database/master/json/countries.json";
  const cscStatesUrl =
    "https://raw.githubusercontent.com/dr5hn/countries-states-cities-database/master/json/states.json";
  const cscAttr =
    "Contains information from countries-states-cities-database (https://github.com/dr5hn/countries-states-cities-database), which is made available under the ODC Open Database License (ODbL).";

  const cscCountries = await fetchJson(cscCountriesUrl, "csc-countries.json");
  const slimCountries = cscCountries.map((c) => ({
    id: String(c.id),
    name: c.name,
    iso2: c.iso2,
    iso3: c.iso3,
    numeric_code: c.numeric_code,
    phonecode: c.phonecode,
    capital: c.capital,
    currency: c.currency,
    region: c.region,
    subregion: c.subregion,
    latitude: c.latitude,
    longitude: c.longitude,
  }));
  await writeDataset({
    domain: "geography",
    id: "countries-csc",
    title: "Countries (CSC)",
    description: "Countries from dr5hn/countries-states-cities-database (slimmed fields).",
    license: "ODbL-1.0",
    version: "1.0.0",
    sourceUrl: "https://github.com/dr5hn/countries-states-cities-database",
    attribution: cscAttr,
    origin: "imported",
    resourcePath: "/countries",
    records: slimCountries,
    notes: "Source file: json/countries.json (fields slimmed for repo size).",
  });

  const cscStates = await fetchJson(cscStatesUrl, "csc-states.json");
  const slimStates = cscStates.map((s) => ({
    id: String(s.id),
    name: s.name,
    country_id: String(s.country_id),
    country_code: s.country_code,
    iso2: s.iso2,
    type: s.type,
    latitude: s.latitude,
    longitude: s.longitude,
  }));
  await writeDataset({
    domain: "geography",
    id: "states-csc",
    title: "States (CSC)",
    description: "States/provinces from dr5hn/countries-states-cities-database (slimmed fields).",
    license: "ODbL-1.0",
    version: "1.0.0",
    sourceUrl: "https://github.com/dr5hn/countries-states-cities-database",
    attribution: cscAttr,
    origin: "imported",
    resourcePath: "/states",
    records: slimStates,
    notes: "Source file: json/states.json (fields slimmed). Full cities dump (~50MB) not imported.",
  });

  // Capitals as capped cities subset (no full cities dump)
  const capitalCities = slimCountries
    .filter((c) => c.capital)
    .map((c, i) => ({
      id: String(i + 1),
      name: c.capital,
      country_id: c.id,
      country_code: c.iso2,
      country_name: c.name,
      is_capital: true,
      latitude: c.latitude,
      longitude: c.longitude,
    }));
  await writeDataset({
    domain: "geography",
    id: "cities-capitals",
    title: "Capital cities (CSC-derived subset)",
    description:
      "Deterministic capital-city subset derived from CSC countries.json — not the full cities dump.",
    license: "ODbL-1.0",
    version: "1.0.0",
    sourceUrl: "https://github.com/dr5hn/countries-states-cities-database",
    attribution: cscAttr,
    origin: "imported",
    resourcePath: "/cities",
    records: capitalCities,
    notes:
      "Capped subset: one capital per country from countries.json. Full json/countries+states+cities.json (~53MB) not bundled.",
  });

  // --- 3 mledoze/countries (ODbL) ---
  const mledozeUrl = "https://raw.githubusercontent.com/mledoze/countries/master/countries.json";
  const mledozeAttr =
    "Contains information from mledoze/countries (https://github.com/mledoze/countries), available under the ODC Open Database License (ODbL).";
  const mledoze = await fetchJson(mledozeUrl, "mledoze-countries.json");
  const slimMledoze = mledoze.map((c) => ({
    id: c.cca3,
    name: c.name?.common ?? c.name?.official ?? c.cca3,
    official: c.name?.official,
    cca2: c.cca2,
    cca3: c.cca3,
    ccn3: c.ccn3,
    region: c.region,
    subregion: c.subregion,
    capital: Array.isArray(c.capital) ? (c.capital[0] ?? null) : (c.capital ?? null),
    currencies: c.currencies ? Object.keys(c.currencies) : [],
    languages: c.languages ? Object.values(c.languages) : [],
    latlng: c.latlng,
  }));
  await writeDataset({
    domain: "geography",
    id: "countries-mledoze",
    title: "Countries (mledoze)",
    description: "Countries from mledoze/countries (slimmed fields).",
    license: "ODbL-1.0",
    version: "1.0.0",
    sourceUrl: "https://github.com/mledoze/countries",
    attribution: mledozeAttr,
    origin: "imported",
    resourcePath: "/countries",
    idField: "id",
    records: slimMledoze,
  });

  // --- 2 country-codes: SKIP redistribute — generate synthetic ISO-like codes ---
  skip(
    "https://github.com/datasets/country-codes",
    "Combined CSV mixes restricted UNTERM and unclear-license sources; maintainers warn against republishing. Substituted with original synthetic country-codes-iso generated locally.",
  );
  const isoSynthetic = slimCountries.map((c) => ({
    id: c.iso2,
    alpha2: c.iso2,
    alpha3: c.iso3,
    numeric: c.numeric_code,
    name: c.name,
    region: c.region,
    currency: c.currency,
  }));
  await writeDataset({
    domain: "reference",
    id: "country-codes-iso",
    title: "Country codes (synthetic ISO-oriented)",
    description:
      "Original synthetic country code table derived from CSC slim fields — substitute for datasets/country-codes.",
    license: "MIT",
    version: "1.0.0",
    sourceUrl: "https://github.com/datasets/country-codes",
    attribution: "Apixa-generated substitute. Not a redistribution of datasets/country-codes.",
    origin: "generated",
    resourcePath: "/country-codes",
    idField: "id",
    records: isoSynthetic,
    substitutes: "https://github.com/datasets/country-codes",
    notes:
      "Generated substitute due to restricted/unclear redistribution terms on the combined upstream file.",
  });

  // --- 11 ExploreMyData, 12 Flavio — catalog pages, skip ---
  skip(
    "https://exploremydata.com/datasets/",
    "Catalog page only; no clear redistributable bulk JSON license established. Domains covered by Faker-generated sets.",
  );
  skip(
    "https://flaviocopes.com/datasets/",
    "Catalog page only; no clear redistributable bulk JSON license established. Domains covered by Faker-generated sets.",
  );

  // --- 13–16 generators: use Faker only (or mulberry fallback); cite others ---
  skip(
    "https://github.com/ngneat/falso",
    "Evaluated generator; not used. Generation uses Faker.js (or built-in PRNG) only.",
  );
  skip(
    "https://github.com/json-schema-faker/json-schema-faker",
    "Evaluated generator; not used. Generation uses Faker.js (or built-in PRNG) only.",
  );
  skip(
    "https://github.com/chancejs/chancejs",
    "Evaluated generator; not used. Generation uses Faker.js (or built-in PRNG) only.",
  );

  let faker;
  try {
    const mod = await import("@faker-js/faker");
    faker = mod.faker;
    faker.seed(SEED);
  } catch {
    console.log("ℹ @faker-js/faker not installed — using deterministic PRNG fallback");
    faker = null;
  }

  const rng = mulberry32(SEED);
  const firstNames = [
    "Ada",
    "Grace",
    "Alan",
    "Katherine",
    "Edsger",
    "Barbara",
    "Donald",
    "Radia",
    "Linus",
    "Margaret",
  ];
  const lastNames = [
    "Lovelace",
    "Hopper",
    "Turing",
    "Johnson",
    "Dijkstra",
    "Liskov",
    "Knuth",
    "Perlman",
    "Torvalds",
    "Hamilton",
  ];
  const companyWords = [
    "North",
    "Bright",
    "Cedar",
    "Pixel",
    "Orbit",
    "Harbor",
    "Summit",
    "Nimbus",
    "Forge",
    "Lattice",
  ];
  const companySuffix = ["Labs", "Systems", "Works", "Studio", "Group", "Soft"];
  const productAdj = ["Aqua", "Solar", "Quiet", "Rapid", "Soft", "Bold", "Clear", "Prime"];
  const productNoun = ["Bottle", "Lamp", "Chair", "Keyboard", "Monitor", "Bag", "Mug", "Notebook"];

  function personName() {
    if (faker) return faker.person.fullName();
    return `${pick(rng, firstNames)} ${pick(rng, lastNames)}`;
  }
  function emailFor(name, i) {
    if (faker) return faker.internet.email({ firstName: name.split(" ")[0] }).toLowerCase();
    const slug = name.toLowerCase().replace(/[^a-z]+/g, ".");
    return `${slug}.${i}@example.com`;
  }
  function companyName() {
    if (faker) return faker.company.name();
    return `${pick(rng, companyWords)} ${pick(rng, companySuffix)}`;
  }
  function productTitle() {
    if (faker) return faker.commerce.productName();
    return `${pick(rng, productAdj)} ${pick(rng, productNoun)}`;
  }
  function price() {
    if (faker) return Number(faker.commerce.price({ min: 5, max: 500 }));
    return Math.round((5 + rng() * 495) * 100) / 100;
  }
  function sentence() {
    if (faker) return faker.lorem.sentence();
    return "Synthetic mock content for local Apixa datasets.";
  }
  function paragraphs() {
    if (faker) return faker.lorem.paragraphs(2);
    return "Synthetic mock body. Deterministic seed 230523. No personal data.";
  }

  // Users (100) — DummyJSON users substitute + Faker
  skip(
    "https://dummyjson.com/users?limit=100",
    "No clear redistributable license for DummyJSON response bodies. Substituted with original synthetic users-mock.",
  );
  const users = Array.from({ length: 100 }, (_, i) => {
    const name = personName();
    return {
      id: String(i + 1),
      name,
      email: emailFor(name, i + 1),
      username: `user${String(i + 1).padStart(3, "0")}`,
      companyId: String((i % 40) + 1),
    };
  });
  await writeDataset({
    domain: "users",
    id: "users-mock",
    title: "Users (synthetic)",
    description: "Deterministic synthetic users (seed 230523). Substitute for DummyJSON users.",
    license: "MIT",
    version: "1.0.0",
    sourceUrl: "https://dummyjson.com/users?limit=100",
    attribution: "Apixa-generated with Faker.js / PRNG. Not DummyJSON data.",
    origin: "generated",
    resourcePath: "/users",
    records: users,
    substitutes: "https://dummyjson.com/users?limit=100",
    notes: `Generator: ${faker ? "@faker-js/faker" : "mulberry32"} seed=${SEED}. Source URL listed as the skipped DummyJSON endpoint.`,
  });

  // Companies (40)
  const companies = Array.from({ length: 40 }, (_, i) => ({
    id: String(i + 1),
    name: companyName(),
    catchPhrase: faker ? faker.company.catchPhrase() : "Quality software for mock demos",
    countryCode: pick(rng, slimCountries).iso2,
  }));
  await writeDataset({
    domain: "companies",
    id: "companies-mock",
    title: "Companies (synthetic)",
    description: "Deterministic synthetic companies with countryCode FK into CSC countries.",
    license: "MIT",
    version: "1.0.0",
    sourceUrl: "https://github.com/faker-js/faker",
    attribution: "Apixa-generated with Faker.js / PRNG (MIT).",
    origin: "generated",
    resourcePath: "/companies",
    records: companies,
    notes: `Generator: ${faker ? "@faker-js/faker" : "mulberry32"} seed=${SEED}.`,
  });

  // Products (100) — DummyJSON products substitute
  skip(
    "https://dummyjson.com/products?limit=100",
    "No clear redistributable license for DummyJSON response bodies. Substituted with original synthetic products-mock.",
  );
  const products = Array.from({ length: 100 }, (_, i) => ({
    id: String(i + 1),
    title: productTitle(),
    description: sentence(),
    price: price(),
    brand: companyName(),
    category: pick(rng, ["electronics", "home", "outdoors", "office", "beauty"]),
    stock: Math.floor(rng() * 200),
  }));
  await writeDataset({
    domain: "products",
    id: "products-mock",
    title: "Products (synthetic)",
    description: "Deterministic synthetic products. Substitute for DummyJSON products.",
    license: "MIT",
    version: "1.0.0",
    sourceUrl: "https://dummyjson.com/products?limit=100",
    attribution: "Apixa-generated with Faker.js / PRNG. Not DummyJSON data.",
    origin: "generated",
    resourcePath: "/products",
    records: products,
    substitutes: "https://dummyjson.com/products?limit=100",
  });

  // Orders (80) — relational
  const orders = Array.from({ length: 80 }, (_, i) => {
    const userId = String((i % 100) + 1);
    const productId = String((i % 100) + 1);
    const qty = 1 + Math.floor(rng() * 5);
    const product = products[Number(productId) - 1];
    return {
      id: String(i + 1),
      userId,
      productId,
      companyId: users[Number(userId) - 1].companyId,
      quantity: qty,
      total: Math.round(product.price * qty * 100) / 100,
      status: pick(rng, ["pending", "paid", "shipped", "delivered", "cancelled"]),
    };
  });
  await writeDataset({
    domain: "orders",
    id: "orders-mock",
    title: "Orders (synthetic)",
    description: "Deterministic orders with FKs to users-mock, products-mock, companies-mock.",
    license: "MIT",
    version: "1.0.0",
    sourceUrl: "https://github.com/faker-js/faker",
    attribution: "Apixa-generated with Faker.js / PRNG (MIT).",
    origin: "generated",
    resourcePath: "/orders",
    records: orders,
  });

  // Posts (100) — DummyJSON posts substitute
  skip(
    "https://dummyjson.com/posts?limit=100",
    "No clear redistributable license for DummyJSON response bodies. Substituted with original synthetic posts-mock.",
  );
  const posts = Array.from({ length: 100 }, (_, i) => ({
    id: String(i + 1),
    title: sentence().replace(/\.$/, ""),
    body: paragraphs(),
    userId: String((i % 100) + 1),
    tags: [pick(rng, ["tech", "life", "news", "design", "dev"])],
  }));
  await writeDataset({
    domain: "social",
    id: "posts-mock",
    title: "Posts (synthetic)",
    description: "Deterministic posts with userId FK. Substitute for DummyJSON posts.",
    license: "MIT",
    version: "1.0.0",
    sourceUrl: "https://dummyjson.com/posts?limit=100",
    attribution: "Apixa-generated with Faker.js / PRNG. Not DummyJSON data.",
    origin: "generated",
    resourcePath: "/posts",
    records: posts,
    substitutes: "https://dummyjson.com/posts?limit=100",
  });

  // Comments (100) — DummyJSON comments substitute
  skip(
    "https://dummyjson.com/comments?limit=100",
    "No clear redistributable license for DummyJSON response bodies. Substituted with original synthetic comments-mock.",
  );
  const comments = Array.from({ length: 100 }, (_, i) => ({
    id: String(i + 1),
    body: sentence(),
    postId: String((i % 100) + 1),
    userId: String(((i * 3) % 100) + 1),
  }));
  await writeDataset({
    domain: "comments",
    id: "comments-mock",
    title: "Comments (synthetic)",
    description:
      "Deterministic comments with postId/userId FKs. Substitute for DummyJSON comments.",
    license: "MIT",
    version: "1.0.0",
    sourceUrl: "https://dummyjson.com/comments?limit=100",
    attribution: "Apixa-generated with Faker.js / PRNG. Not DummyJSON data.",
    origin: "generated",
    resourcePath: "/comments",
    records: comments,
    substitutes: "https://dummyjson.com/comments?limit=100",
  });

  // Record Faker as used generator (not skipped)
  const generatorsNote = {
    used: faker ? "@faker-js/faker" : "mulberry32 PRNG fallback",
    seed: SEED,
    evaluatedNotUsed: [
      "https://github.com/ngneat/falso",
      "https://github.com/json-schema-faker/json-schema-faker",
      "https://github.com/chancejs/chancejs",
    ],
    primaryGeneratorUrl: "https://github.com/faker-js/faker",
  };

  const manifestDoc = {
    version: "1.0.0",
    generatedAt: new Date().toISOString(),
    seed: SEED,
    generators: generatorsNote,
    datasets: manifest.sort((a, b) => a.id.localeCompare(b.id)),
    skipped,
  };

  await writeFile(join(DATASETS, "manifest.json"), JSON.stringify(manifestDoc, null, 2) + "\n");

  const attribution = `# Dataset attribution

Local mock fixtures for Apixa. See \`manifest.json\` for per-dataset license, source URL, and import vs generated.

## Imported

- **parseapi/lists** — CC0-1.0 — https://github.com/parseapi/lists
- **dr5hn/countries-states-cities-database** — ODbL-1.0 — https://github.com/dr5hn/countries-states-cities-database
  - Full cities dump not bundled; capital-city subset only.
- **mledoze/countries** — ODbL-1.0 — https://github.com/mledoze/countries

ODbL databases: if you publicly use a produced work from these databases, you must offer that produced database under ODbL (share-alike). See each upstream LICENSE.

## Generated (not redistributions)

Synthetic sets use deterministic seed \`${SEED}\` (${generatorsNote.used}). Listed DummyJSON / catalog / unclear-license URLs were **not** redistributed; see \`manifest.json\` → \`skipped\`.

## Not bundled

See \`manifest.json\` → \`skipped\` for reasons (restricted/unclear license, catalog-only pages, unused generators).
`;
  await writeFile(join(DATASETS, "ATTRIBUTION.md"), attribution);

  console.log(`\nWrote ${manifest.length} datasets; skipped ${skipped.length} sources.`);
  console.log(`Manifest: datasets/manifest.json`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
