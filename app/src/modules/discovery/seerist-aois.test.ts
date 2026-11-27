import assert from "node:assert/strict";
import test from "node:test";
import { parseSeeristCountryAois, resolveGeographyAois } from "./seerist-aois.js";

test("resolves country names, aliases, composite strings, and ISO codes while ignoring supranational regions and prepositions", () => {
  const resolved = resolveGeographyAois([
    "Poland and Baltic Sea",
    "Russia",
    "United Kingdom",
    "DNK",
    "Northern Europe",
    "Global",
    "NATO",
    "Risks in to or by ports"
  ]);

  assert.deepEqual(
    resolved.map((entry) => [entry.aoiId, entry.iso2, entry.iso3, entry.displayName]),
    [
      ["pl", "PL", "POL", "Poland"],
      ["ru", "RU", "RUS", "Russia"],
      ["gb", "GB", "GBR", "United Kingdom"],
      ["dk", "DK", "DNK", "Denmark"]
    ]
  );
});

test("parses /v1/aois/country payloads and merges custom AOI definitions cleanly", () => {
  const catalog = parseSeeristCountryAois([
    {
      type: "Feature",
      properties: { iso2: "PL", iso3: "POL", displayName: "Poland", officialName: "Republic of Poland" }
    },
    {
      type: "Feature",
      properties: { iso2: "XK", iso3: "XKX", displayName: "Kosovo" }
    }
  ]);

  assert.equal(catalog.ok, true);
  if (!catalog.ok) return;
  assert.equal(catalog.value.length, 2);
  const resolved = resolveGeographyAois(["Kosovo", "POL"], catalog.value);
  assert.deepEqual(
    resolved.map((entry) => [entry.aoiId, entry.iso2, entry.iso3]),
    [
      ["xk", "XK", "XKX"],
      ["pl", "PL", "POL"]
    ]
  );
});
