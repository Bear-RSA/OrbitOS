import { describe, expect, it } from "vitest";

import { isIconName, MAX_DEPARTMENT_DESCRIPTION, normaliseDepartmentDescription } from "./department-details";

describe("normaliseDepartmentDescription", () => {
  it("trims, squeezes spaces and caps the length", () => {
    expect(normaliseDepartmentDescription("  Builds   the\nproduct ")).toBe("Builds the product");
    expect(normaliseDepartmentDescription("x".repeat(500))).toHaveLength(MAX_DEPARTMENT_DESCRIPTION);
  });

  it("reads blank or junk as no description", () => {
    expect(normaliseDepartmentDescription("   ")).toBeNull();
    expect(normaliseDepartmentDescription(42)).toBeNull();
  });
});

describe("isIconName", () => {
  it("takes kebab-case names only", () => {
    expect(isIconName("rocket")).toBe(true);
    expect(isIconName("building-2")).toBe(true);
    expect(isIconName("Rocket")).toBe(false);
    expect(isIconName("../evil")).toBe(false);
    expect(isIconName("a--b")).toBe(false);
  });
});
