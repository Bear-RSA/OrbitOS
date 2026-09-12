import { describe, expect, it } from "vitest";
import { HARD_MAX_PARTICIPANTS } from "@/lib/calls/ceiling";
import {
  callParticipantNames,
  callParticipants,
  directCallSeats,
  isOnCall,
  listNames,
  othersInCall,
} from "@/lib/calls/party";

/* ------------------------------------------------------------------ */
/*  Who is in a direct call                                            */
/*                                                                     */
/*  Calls written before `participants` existed are the case that     */
/*  matters: every one of them must still read as the pair it was.    */
/* ------------------------------------------------------------------ */

const OLD_ACTIVE = { from: "u_a", to: "u_b", fromName: "Ada", toName: "Ben", status: "active" };
const OLD_RINGING = { ...OLD_ACTIVE, status: "ringing" };
const NEW = {
  ...OLD_ACTIVE,
  participants: ["u_a", "u_b", "u_c"],
  participantNames: { u_a: "Ada", u_b: "Ben", u_c: "Cy" },
};

describe("callParticipants", () => {
  it("reads the list when there is one", () => {
    expect(callParticipants(NEW)).toEqual(["u_a", "u_b", "u_c"]);
  });

  it("derives the pair from an answered call without one", () => {
    expect(callParticipants(OLD_ACTIVE)).toEqual(["u_a", "u_b"]);
  });

  it("derives only the caller while an old call still rings", () => {
    expect(callParticipants(OLD_RINGING)).toEqual(["u_a"]);
  });

  it("treats an empty list as absent", () => {
    expect(callParticipants({ ...OLD_ACTIVE, participants: [] })).toEqual(["u_a", "u_b"]);
  });
});

describe("callParticipantNames", () => {
  it("falls back to the pair's names", () => {
    expect(callParticipantNames(OLD_ACTIVE)).toEqual({ u_a: "Ada", u_b: "Ben" });
    expect(callParticipantNames(OLD_RINGING)).toEqual({ u_a: "Ada" });
  });
});

describe("isOnCall", () => {
  it("counts the ends and the list", () => {
    expect(isOnCall(NEW, "u_c")).toBe(true);
    expect(isOnCall(OLD_ACTIVE, "u_b")).toBe(true);
    expect(isOnCall(OLD_ACTIVE, "u_z")).toBe(false);
  });
});

describe("directCallSeats", () => {
  it("sizes the room to the plan", () => {
    expect(directCallSeats(4)).toBe(4);
  });

  it("uses the ceiling when the plan does not narrow it", () => {
    expect(directCallSeats(-1)).toBe(HARD_MAX_PARTICIPANTS);
  });

  it("never builds a room for fewer than two", () => {
    expect(directCallSeats(1)).toBe(2);
  });
});

describe("headline names", () => {
  it("leaves the asker out", () => {
    expect(othersInCall(NEW, "u_b")).toEqual(["Ada", "Cy"]);
  });

  it("joins names the way a sentence does", () => {
    expect(listNames([])).toBe("");
    expect(listNames(["Ada"])).toBe("Ada");
    expect(listNames(["Ada", "Ben"])).toBe("Ada and Ben");
    expect(listNames(["Ada", "Ben", "Cy"])).toBe("Ada, Ben and Cy");
  });
});
