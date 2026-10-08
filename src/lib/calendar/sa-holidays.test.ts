import { describe, expect, it } from "vitest";
import { easterSunday, saHolidayName, saPublicHolidays } from "./sa-holidays";

describe("easterSunday", () => {
  it.each([
    [2024, "2024-03-31"],
    [2025, "2025-04-20"],
    [2026, "2026-04-05"],
    [2027, "2027-03-28"],
  ])("%i", (year, expected) => {
    expect(easterSunday(year).toISOString().slice(0, 10)).toBe(expected);
  });
});

describe("saPublicHolidays", () => {
  it("has the twelve statutory days plus any observed Mondays", () => {
    // 2025: only Freedom Day fell on a Sunday.
    const days = saPublicHolidays(2025);
    expect(days.size).toBe(13);
    expect(days.get("2025-04-28")).toBe("Freedom Day (observed)");
  });

  it("places Good Friday and Family Day off Easter", () => {
    expect(saHolidayName("2026-04-03")).toBe("Good Friday");
    expect(saHolidayName("2026-04-06")).toBe("Family Day");
  });

  it("moves a Sunday holiday to the Monday", () => {
    // Youth Day 2024 was a Sunday.
    expect(saHolidayName("2024-06-16")).toBe("Youth Day");
    expect(saHolidayName("2024-06-17")).toBe("Youth Day (observed)");
  });

  it("rolls past a Monday that is already a holiday", () => {
    // Christmas 2022 was a Sunday; the 26th is the Day of Goodwill.
    expect(saHolidayName("2022-12-26")).toBe("Day of Goodwill");
    expect(saHolidayName("2022-12-27")).toBe("Christmas Day (observed)");
  });

  it("includes declared one-offs", () => {
    expect(saHolidayName("2024-05-29")).toBe("General Election Day");
  });

  it("returns null on an ordinary day", () => {
    expect(saHolidayName("2026-10-08")).toBeNull();
  });
});
