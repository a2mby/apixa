# Playground datasets

Local development follow-up requested after the v1.8.1 environment milestone: migrations, Eloquent models, complete JSON source datasets, private file fixtures and native MongoDB. This expands the author's backend data setup without changing the Apixa SDK or adding routes/controllers. The original frozen environment-only milestone is not rewritten. Nothing in this follow-up is published.

PostgreSQL remains the primary database. “JSON database” here means actual PostgreSQL **JSONB columns**, queried with Laravel's native JSON operators; it is not a second JSON-file database server. The committed JSON files are reproducible source fixtures. MongoDB provides a separate document representation of three selected datasets.

## What's available

| Source JSON under `records/` | Model           | Rows | Relationships / special data                                                                                                                 |
| ---------------------------- | --------------- | ---: | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `workspaces.json`            | `Workspace`     |    3 | Has contacts/articles/products/documents/tasks/counters and both identity examples; ws-3 is empty                                            |
| `contacts.json`              | `Contact`       |   40 | Belongs to workspace; has profile/articles/comments/ownedDocuments/documentLinks/tasks; optional avatar string and documents reference array |
| `numeric-records.json`       | `NumericRecord` |   20 | Integer identity including 0; next generated identity exceeds all existing seeded/manual IDs                                                 |
| `uuid-records.json`          | `UuidRecord`    |   20 | Native PostgreSQL UUID primary keys, deterministic UUID values                                                                               |
| `articles.json`              | `Article`       |   63 | Workspace/contact parents, comments, nullable publication time, tied ranks, JSONB metadata                                                   |
| `comments.json`              | `Comment`       |   90 | Article/contact parents; first 45 articles have two comments, final 18 have none                                                             |
| `products.json`              | `Product`       |  120 | Workspace parent; decimal price, stock, JSONB tags/attributes, unique SKU/slug                                                               |
| `profiles.json`              | `Profile`       |   12 | One-to-one contact relation; JSONB payload with nested objects, arrays, omitted keys, null, false and zero                                   |
| `documents.json`             | `Document`      |   24 | Workspace/contact parents; references to verified private fixture bytes; has links                                                           |
| `document-links.json`        | `DocumentLink`  |   12 | Two contacts reference each of the first six document records; duplicate document/contact pairs prohibited                                   |
| `tasks.json`                 | `Task`          |   18 | Workspace/contact parents, version, priority and JSONB metadata; no transition logic implemented                                             |
| `counters.json`              | `Counter`       |    3 | Zero, positive and negative starting values plus version; no concurrency endpoint implemented                                                |

Baseline: **425 relational rows**. The framework's default users/cache/jobs tables remain; no authentication users are seeded.

MongoDB sources under `mongodb/`:

| JSON            | Model namespace `App\Models\Mongo` | Collection | Documents |
| --------------- | ---------------------------------- | ---------- | --------: |
| `profiles.json` | `MongoProfile`                     | `profiles` |        12 |
| `products.json` | `MongoProduct`                     | `products` |       120 |
| `articles.json` | `MongoArticle`                     | `articles` |        63 |

Baseline: **195 MongoDB documents**, excluding the migration repository. Articles embed their comments; products embed attributes/variants/tags; profiles embed their nested payload. Source IDs become deterministic Mongo `_id` strings exposed as `id` by Eloquent. Mongo products store prices as native BSON Decimal128; the model returns two-decimal strings, like the PostgreSQL model. JSONB and BSON preserve an empty object separately from an empty array. `Profile.payload` uses the `object` cast for that purpose.

These are independent snapshots. Editing PostgreSQL does not automatically synchronize MongoDB, and references to relational IDs inside Mongo documents are not cross-database foreign keys. Native Mongo ObjectId is not used for this baseline. No SQL/Mongo distributed transaction or global tenant authorization is implied.

## Schema and model decisions

- Foreign keys use restrictive deletion. Delete dependent records explicitly when testing deletion; there is no hidden cascade/file-deletion service.
- Composite contact/workspace keys on articles, tasks and documents prevent assigning a parent contact from a different workspace. Comments/link access still needs the author's endpoint authorization policy.
- Unique email/slug/SKU/contact-profile and document-contact constraints are real database constraints.
- Check constraints reject negative price/stock/file size and nonpositive task/counter versions.
- Common parent/filter/order columns have B-tree indexes. Selected JSONB containment fields have GIN indexes; Mongo collections have unique and query/embedded-field indexes.
- String-ID models require an ID when creating a new row. `NumericRecord` uses native generated integer identity; `UuidRecord` requires a valid UUID. The fixtures provide stable IDs; no custom ID generation service is added.
- Contacts have both a `documents` reference-array attribute and an `ownedDocuments()` relationship. The different relationship name prevents an Eloquent attribute/relation collision.
- Values are synthetic, with fixed timestamps. Arabic, accents, emoji, mixed case, omitted versus null properties, empty arrays/objects and numeric/boolean edge values are deliberate.

## Install native MongoDB on macOS

Use a PHP runtime compatible with Laravel 13 and the extension built for **that same runtime**. Local verification uses Homebrew PHP 8.4.

```bash
brew tap mongodb/brew
# If your Homebrew version requires explicitly trusting the official tap:
brew trust mongodb/brew
brew install mongodb/brew/mongodb-community@8.0
brew services start mongodb/brew/mongodb-community@8.0

export PATH="/opt/homebrew/opt/php@8.4/bin:/opt/homebrew/opt/php@8.4/sbin:$PATH"
php -v
# Ensure Homebrew's extension directory exists if its pecl symlink has no target.
mkdir -p "$(php-config --extension-dir)"
pecl install mongodb
php --ri mongodb

composer install
```

PECL may add `extension=mongodb.so` to the selected php.ini automatically. If it does not, enable it once in that runtime's configuration. Do not enable it a second time in conf.d. If you switch to Herd/another PHP version, enable/install a matching extension there too; an extension built for another PHP API version cannot be reused blindly.

The official `mongodb/laravel-mongodb` package and its PHP library are locked in Composer. MongoDB's native developer service binds only to loopback here and uses its local unauthenticated development configuration. A deployment must supply its own authenticated/TLS connection; no public Mongo service or production deployment was configured. `mongosh` is a system tool; Laravel has no npm manifest or Node dependency.

## Environment selection

Each of the four tracked example environments includes `MONGODB_URI` and `MONGODB_DATABASE`. The local URI is `mongodb://127.0.0.1:27017`; the production example leaves both values externally supplied.

| Artisan environment                 | PostgreSQL database  | MongoDB database     |
| ----------------------------------- | -------------------- | -------------------- |
| Default `.env`, APP_ENV=local       | `apixa_laravel_dev`  | `apixa_laravel_dev`  |
| `--env=testing`, APP_ENV=testing    | `apixa_laravel_test` | `apixa_laravel_test` |
| `--env=playwright`, APP_ENV=testing | `apixa_laravel_e2e`  | `apixa_laravel_e2e`  |

These names identify separate databases on separate engines. MongoDB creates a database when its first collection is created; PostgreSQL databases/roles must be provisioned using the [backend setup](../../README.md). Copy each example to its private environment variant and generate its own APP_KEY when preparing a new machine. Never copy an actual secret into an example file.

Seeders refuse production and unrelated database names, even with `--force`. They also reject a local/testing environment paired with the wrong database family and verify the resolved connection identity before seeding. PHPUnit pins both stores to the test databases. Clear cached config before switching environments so cached settings do not select another database.

## Migrate and seed development

From `examples/backends/laravel-backend`, after the native services and private `.env` are prepared:

```bash
export PATH="/opt/homebrew/opt/php@8.4/bin:/opt/homebrew/opt/php@8.4/sbin:$PATH"
brew services start postgresql@16
brew services start mongodb/brew/mongodb-community@8.0

php artisan config:clear
# Framework defaults plus the two PostgreSQL playground migrations:
php artisan migrate
# Separate migration repository and explicit Mongo schema/index path:
php artisan migrate --database=mongodb --path=database/migrations/mongodb
# Small file fixtures + all PostgreSQL rows + Mongo documents:
php artisan db:seed
```

Use normal `migrate`, not `migrate:fresh`. Nothing drops/resets a database or truncates a table. The independent Mongo migration path prevents the PostgreSQL command from trying to create document collections.

`DatabaseSeeder` checks both identities first. It writes small private fixtures, upserts relational records inside a PostgreSQL transaction, then upserts Mongo documents individually. Re-running restores **known fixture IDs** to their fixture values, does not add duplicates and preserves rows with unrelated IDs. It intentionally overwrites manual edits to seeded IDs, so use new IDs for records you want to keep across seeding.

Mongo standalone supports atomic individual document writes, not the multi-document transaction guarantees of a replica set. Seeding is not atomic across PostgreSQL, MongoDB and the filesystem. If a later phase fails, correct the problem and rerun; deterministic IDs make partial initialization recoverable. Do not interpret seeder success as business-transaction/concurrency correctness.

You can seed a selected store explicitly:

```bash
php artisan db:seed --class=FileFixtureSeeder
php artisan db:seed --class=RelationalPlaygroundSeeder
php artisan db:seed --class=MongoPlaygroundSeeder
```

When a fixture's private target file already has different bytes, seeding refuses to overwrite it. Inspect the changed file and explicitly remove/relocate only that owned fixture before rerunning if restoring its baseline is intended. Other uploaded files are untouched.

## Isolated backend-test and E2E preparation

These are explicit commands for independently selected environments. They create schema/seed data but never drop/reset either database.

```bash
php artisan config:clear
php artisan migrate --env=testing
php artisan migrate --env=testing --database=mongodb --path=database/migrations/mongodb
php artisan db:seed --env=testing
php artisan test --env=testing

php artisan config:clear
php artisan migrate --env=playwright
php artisan migrate --env=playwright --database=mongodb --path=database/migrations/mongodb
php artisan db:seed --env=playwright
```

Feature tests require both real services and the migrated test schema. SQL tests use transactions/savepoints rather than RefreshDatabase/migrate:fresh. Mongo tests use fixed baseline IDs and clean up only their own manual sentinel document. They never drop collections. Tests deliberately restore baseline fixture IDs in the test stores; use the development database for manual edits you want to retain.

## Start exploring through Tinker

```bash
php artisan tinker
```

```php
// Real relations and eager loading:
App\Models\Workspace::with('contacts')->find('ws-1');
App\Models\Article::with(['contact', 'comments.contact'])->find('article-001');
App\Models\Contact::with('ownedDocuments')->find('contact-002');
App\Models\Document::with('links.contact')->find('document-001');

// Predictable pagination: final page has three rows.
App\Models\Article::orderBy('rank')->orderBy('id')->paginate(10, ['*'], 'page', 7);

// Actual PostgreSQL JSONB queries:
App\Models\Profile::where('payload->address->city', 'Amman')->get();
App\Models\Product::whereJsonContains('tags', 'sale')->get();

// Separate Mongo documents, including embedded comments:
App\Models\Mongo\MongoProfile::where('payload.address.city', 'Amman')->get();
App\Models\Mongo\MongoProduct::where('stock', 0)->get();
App\Models\Mongo\MongoArticle::find('article-001')->comments;

// Read a real private file through Laravel's disk, not a public endpoint:
$document = App\Models\Document::find('document-001');
$bytes = Storage::disk($document->disk)->get($document->path);
hash('sha256', $bytes) === $document->sha256;

// Identity examples and concurrency starting points:
App\Models\NumericRecord::find(0);
App\Models\UuidRecord::first();
App\Models\Counter::find('counter-zero');
```

For actual SQL locking experiments use independent connections/requests and explicit transactions. No automatic lock/version policy is implemented by a `version` column. Mongo references do not automatically join PostgreSQL models. Use the normal SQL relation methods or Mongo embedded-document queries according to the store being tested.

## Optional generated scale profiles

The default seed stays small. Two explicit PostgreSQL profiles are available without committing huge JSON files:

```bash
# Adds a separate scale-pagination workspace/contact and 1,000 articles:
php artisan db:seed --class=ScalePlaygroundSeeder
# Adds a separate scale-stress workspace/contact and 100,000 articles:
php artisan db:seed --class=StressPlaygroundSeeder
```

Generation/upserts use batches of 500, predictable IDs and fixed article timestamps. Rerunning a profile updates the same generated IDs; it does not duplicate them or erase the baseline. Filter by `workspace_id` to compare these profiles without changing baseline pagination expectations. They do not generate Mongo counterparts. The 1,000-row profile is exercised inside an isolated test transaction; neither profile is loaded into development by default. The 100,000-row profile is explicit opt-in and is not part of the normal test run.

## File fixtures

`files/file-fixtures.json` describes **21 small files** with actual byte lengths and SHA-256 hashes. Sources live in `files/sources/*.fixture`; their source extension avoids accidentally serving/executing a submitted filename. Seeding copies bytes into the standard **private** local disk under `playground-fixtures/v1/`, using the manifest's filename, MIME description and path.

Fixtures cover empty/one-byte/Unicode text, deterministic binary bytes, a valid tiny PNG/PDF/ZIP, duplicate filenames/different bytes, same bytes/different filenames, spaces, suffixes, dotfiles, absent/mismatched MIME descriptions and 1023/1024/1025-byte size boundaries. The example limits in the manifest are test inputs, not automatically applied backend validation rules. A file's claimed MIME/name is not a content-validation guarantee.

The manifest also describes **64, 256 and 512 MiB** files, with deterministic hashes. These are optional and **not generated by default**:

```bash
# Explicit opt-in: consumes 832 MiB of private disk space plus temporary-file space.
php artisan db:seed --class=LargeFileFixtureSeeder
```

The generator writes/checks in bounded chunks. Existing large files must have the expected size/hash or generation refuses to overwrite them. They have no automatically created download/upload routes or Document rows. Remove only these owned fixture paths explicitly if you no longer need them; do not clear a whole storage disk to clean up a test.

## Scenario catalogs

Six JSON files under `scenarios/` cover request inputs, response representations, reliability, concurrency, advanced transfers and destination/security behavior. They include concrete inputs, ordering/delay descriptors and expected outcomes. They are valid JSON reference documents, not executable endpoint definitions. All are marked `executable: false` and are **not inserted into SQL/Mongo as application data**.

Laravel does not gain malformed-response, delay, redirect, authentication, upload, download, locking or chunk-session endpoints from these descriptors. The author still owns those routes/controllers/protocols. TypeScript, packaging, Core mock ownership and historical migration cases continue to run in their own consumers rather than being simulated by Laravel.

## Verification and delivery record

The added feature checks are `tests/Feature/PlaygroundDataTest.php` and `tests/Feature/MongoPlaygroundDataTest.php`. They verify real constraints, JSON/BSON shapes and decimal types, relations, repeatable upserts, preserved nonfixture IDs, private byte/hash equality and unsafe-seeding rejection. The existing default tests remain.

Local setup selected PHP 8.4.21, MongoDB PHP extension 2.5.7, MongoDB Community 8.0.38 and `mongodb/laravel-mongodb` 5.12.0 with `mongodb/mongodb` 2.5.1. PostgreSQL remains 16.15. The Homebrew install also installed Mongo shell/tools and updated their system dependencies; it did not add Node to Laravel or change Apixa manifests.

Verified locally on November 12, 2026: all three environment pairs migrated/seeded and read back at 425 relational rows plus 195 documents each; 21 small fixture sources match their byte/hash manifest; 15 backend tests / 106 assertions pass against real PostgreSQL and MongoDB; Composer strict validation/platform checks/audit, Pint, 49 PHP syntax checks and config/route/view caching pass. Full `pnpm verify` completed with exit 0 (1,600 SDK tests plus consumer/browser/edge checks). The npm dry-run artifact contains 208 files and no Laravel/examples. The 100,000-row profile and 832 MiB large-file profile were not run; they remain explicit opt-in commands.

Concurrent unrelated AI-workflow changes modified the root verification scripts during this work. The completed `pnpm verify` run used the earlier pipeline. An additional run of the newly introduced `pnpm ai:test` finished with 16/18 passing: rule-body preservation (`tests/ai/sync.test.mjs:77`) and conditional rule activation (`:277`) failed. `pnpm ai:check` passed. These unrelated workflow files were not edited by the Laravel task; current full-pipeline green status is not claimed. No commit, push, release or deployment is part of this local data setup. The author's existing edit to `routes/api.php` is left intact.
