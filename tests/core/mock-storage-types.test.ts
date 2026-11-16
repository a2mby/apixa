import {
  defineApi,
  mockFileFixture,
  mockFixtureRef,
  mockFiles,
  MockFileStorage,
  type MockFileMeta,
  type MockFixtureRef,
  type MockStorageOptions,
} from "@apixa/core";
import { defineMockApi } from "@apixa/mocking";
import { expectTypeOf, it } from "vitest";

it("infers fixture-backed entity fields and keeps File/Blob write signatures", async () => {
  const api = defineApi({
    baseURL: "https://example.test",
    resources: {
      docs: {
        path: "/docs",
        fileFields: ["file", "files"],
        mock: {
          data: [
            {
              id: 1,
              title: "document" as string,
              file: mockFixtureRef("a"),
              files: [mockFixtureRef("a")],
            },
          ],
          fixtures: { a: mockFileFixture("hello", { name: "a.txt" }) },
          storage: { disk: "tests", naming: ({ name }) => name },
        },
      },
    },
  });
  const row = await api.docs.getById(1);
  expectTypeOf(row.file).toEqualTypeOf<string>();
  expectTypeOf(row.files).toEqualTypeOf<string[]>();
  expectTypeOf<Parameters<typeof api.docs.create>[0]["file"]>().toEqualTypeOf<File | Blob>();
  expectTypeOf(mockFiles(api).get(row.file)!.meta).toEqualTypeOf<MockFileMeta>();
  expectTypeOf(mockFixtureRef("a")).toEqualTypeOf<MockFixtureRef<"a">>();
  expectTypeOf(mockFileFixture(new Uint8Array(), { name: "bytes" }).content).toEqualTypeOf<
    string | Uint8Array | Blob
  >();
});

it("types adapter writes separately from returned references", () => {
  const api = defineMockApi({
    resources: { users: { type: "users-mock", fileFields: ["email"] } },
  });
  type Input = Parameters<typeof api.users.patch>[1];
  expectTypeOf<Input["email"]>().toEqualTypeOf<string | File | Blob | undefined>();
  expectTypeOf<Awaited<ReturnType<typeof api.users.getById>>["email"]>().toEqualTypeOf<string>();
  expectTypeOf(mockFiles(api.users)).toEqualTypeOf<MockFileStorage>();
});

// Compile-only negative cases. No invalid runtime configurations are executed.
function invalid() {
  // @ts-expect-error a fixture needs an explicit name
  mockFileFixture("text", {});
  // @ts-expect-error binary content must be runtime-neutral bytes, text or Blob
  mockFileFixture(42, { name: "x" });
  // @ts-expect-error fixture reference keys are strings
  mockFixtureRef(42);
  // @ts-expect-error generated identities must be UUID strings
  const options: MockStorageOptions = { generateId: () => 42 };
  // @ts-expect-error naming supports a finite strategy vocabulary
  new MockFileStorage({ naming: "random" });
  // @ts-expect-error filters reject unknown keys
  new MockFileStorage().list({ recursive: true });
  const badConfig = {
    baseURL: "https://example.test",
    resources: { docs: { path: "/docs", mock: { data: [{ id: 1 }], storage: { disk: 42 } } } },
  };
  // @ts-expect-error storage configuration is typed
  defineApi(badConfig);
  const badAdapter = {
    resources: { users: { type: "users-mock" as const, fileFields: ["unknown-field"] as const } },
  };
  // @ts-expect-error adapter file fields must exist on its dataset entity
  defineMockApi(badAdapter);
  void options;
}
void invalid;
