import { describe, expect, it } from "vitest";

import { cardWires, isOnCanvas, layOutChart } from "./chart-layout";
import { startingPosition, ROW } from "./org-chart";

const chart = {
  people: [
    { id: "own", name: "Thandi", role: "OWNER" },
    { id: "mgr", name: "Lebo", role: "MANAGER" },
    { id: "m1", name: "Ana", role: "MEMBER" },
    { id: "loose", name: "Bo", role: "MEMBER" },
  ],
  departments: [{ id: "eng", name: "Engineering" }],
  positions: { "p:own": { x: 400, y: 10 } },
  parents: { "d:eng": "p:own", "p:mgr": "d:eng", "p:m1": "p:mgr" },
};

const cards = layOutChart(chart);
const card = (id: string) => cards.find((c) => c.id === id)!;

describe("layOutChart", () => {
  it("puts a moved card where it was left", () => {
    expect(card("p:own").position).toEqual({ x: 400, y: 10 });
  });

  it("gives an unmoved card the canvas's starting spot", () => {
    expect(card("p:mgr").position).toEqual(startingPosition(ROW.MANAGER, 0));
    expect(card("d:eng").position).toEqual(startingPosition(ROW.DEPARTMENT, 0));
  });

  it("gives a Member a card once they're on the canvas, and none before", () => {
    expect(card("p:m1").position).toEqual(startingPosition(ROW.MEMBER, 0));
    expect(cards.some((c) => c.id === "p:loose")).toBe(false);
  });

  it("names the person wired above a department as its head", () => {
    const eng = card("d:eng");
    expect(eng.kind === "DEPARTMENT" && eng.head?.id).toBe("own");
  });
});

describe("reportsTo", () => {
  const said = (id: string) => {
    const c = card(id);
    return c.kind === "DEPARTMENT" ? undefined : c.reportsTo;
  };

  it("says who each person reports to, through a department to its head", () => {
    expect(said("p:own")).toBeNull();
    expect(said("p:mgr")).toBe("Reports to Thandi · Engineering");
    expect(said("p:m1")).toBe("Reports to Lebo");
  });

  it("says when a department has no head, or someone isn't wired", () => {
    const loose = layOutChart({
      ...chart,
      positions: { "p:loose": { x: 0, y: 0 } },
      parents: { "p:mgr": "d:eng" },
    });
    const of = (id: string) => {
      const c = loose.find((x) => x.id === id)!;
      return c.kind === "DEPARTMENT" ? undefined : c.reportsTo;
    };
    expect(of("p:mgr")).toBe("In Engineering · no head yet");
    expect(of("p:loose")).toBe("Not connected yet");
  });
});

describe("tint", () => {
  it("shades everyone in a department, and whoever sits above it, with its colour", () => {
    const tinted = layOutChart({ ...chart, departments: [{ id: "eng", name: "Engineering", tint: "rose" }] });
    const tintOfCard = (id: string) => {
      const c = tinted.find((x) => x.id === id)!;
      return c.kind === "DEPARTMENT" ? undefined : c.tint;
    };
    expect(tintOfCard("p:mgr")).toBe("rose");
    expect(tintOfCard("p:m1")).toBe("rose");
    // The Owner heads Engineering, so they carry its shade too.
    expect(tintOfCard("p:own")).toBe("rose");
  });

  it("gives someone above several departments the nearest, then the first by name", () => {
    const tinted = layOutChart({
      people: [
        { id: "own", name: "Thandi", role: "OWNER" },
        { id: "ex", name: "Sipho", role: "EXECUTIVE" },
      ],
      departments: [
        { id: "ops", name: "Operations", tint: "emerald" },
        { id: "art", name: "Art", tint: "violet" },
        { id: "deep", name: "Accounts", tint: "coral" },
      ],
      positions: {},
      parents: { "d:ops": "p:own", "d:art": "p:own", "p:ex": "p:own", "d:deep": "p:ex" },
    });
    const owner = tinted.find((c) => c.id === "p:own")!;
    // Art and Operations are wired straight to the Owner; Accounts is a level further down.
    expect(owner.kind !== "DEPARTMENT" && owner.tint).toBe("violet");
  });
});

describe("isOnCanvas", () => {
  it("counts a drop on the canvas or a wire either way", () => {
    expect(isOnCanvas("p:loose", { positions: { "p:loose": { x: 0, y: 0 } }, parents: {} })).toBe(true);
    expect(isOnCanvas("p:loose", { positions: {}, parents: { "d:x": "p:loose" } })).toBe(true);
    expect(isOnCanvas("p:loose", { positions: {}, parents: {} })).toBe(false);
  });
});

describe("cardWires", () => {
  it("draws only wires between cards", () => {
    const ids = new Set(cards.map((c) => c.id));
    expect(cardWires({ ...chart.parents, "p:loose": "p:gone" }, ids)).toEqual([
      { from: "p:own", to: "d:eng" },
      { from: "d:eng", to: "p:mgr" },
      { from: "p:mgr", to: "p:m1" },
    ]);
  });
});
