import { describe, expect, it } from "vitest";
import {
  HARD_MAX_DOCUMENTS,
  HARD_MAX_FILE_BYTES,
  HARD_MAX_STORAGE_BYTES,
  MB,
  admitVaultUpload,
  formatBytes,
  vaultDocumentAllowance,
  vaultStorageAllowance,
  withinFileCeiling,
} from "@/lib/vault/ceiling";

/* ------------------------------------------------------------------ */
/*  Vault cost ceilings                                                */
/*                                                                     */
/*  Always on, independent of the paywall, because stored bytes are a  */
/*  Cloudinary invoice that keeps arriving. Every test here is about   */
/*  the direction that costs money: a caller must never ask for MORE   */
/*  room than the ceiling and be given it.                             */
/* ------------------------------------------------------------------ */

describe("storage allowance", () => {
  it("converts the tier's megabytes into bytes", () => {
    expect(vaultStorageAllowance(100)).toBe(100 * MB);
  });

  it("clamps a tier more generous than the ceiling", () => {
    expect(vaultStorageAllowance(1_000_000)).toBe(HARD_MAX_STORAGE_BYTES);
  });

  it("treats -1 as 'the plan does not narrow it', never as unlimited", () => {
    expect(vaultStorageAllowance(-1)).toBe(HARD_MAX_STORAGE_BYTES);
  });

  it("does not let a non-number become unbounded storage", () => {
    expect(vaultStorageAllowance(Number.NaN)).toBe(HARD_MAX_STORAGE_BYTES);
    expect(vaultStorageAllowance(Number.POSITIVE_INFINITY)).toBe(HARD_MAX_STORAGE_BYTES);
  });
});

describe("document allowance", () => {
  it("passes a tier under the ceiling through", () => {
    expect(vaultDocumentAllowance(25)).toBe(25);
  });

  it("clamps a tier above the ceiling", () => {
    expect(vaultDocumentAllowance(999_999)).toBe(HARD_MAX_DOCUMENTS);
  });

  it("treats -1 as the ceiling rather than unlimited", () => {
    expect(vaultDocumentAllowance(-1)).toBe(HARD_MAX_DOCUMENTS);
  });
});

describe("single file ceiling", () => {
  it("accepts a file at the limit", () => {
    expect(withinFileCeiling(HARD_MAX_FILE_BYTES)).toBe(true);
  });

  it("rejects a file one byte over", () => {
    expect(withinFileCeiling(HARD_MAX_FILE_BYTES + 1)).toBe(false);
  });

  it("rejects a size the browser could not read", () => {
    expect(withinFileCeiling(0)).toBe(false);
    expect(withinFileCeiling(-1)).toBe(false);
    expect(withinFileCeiling(Number.NaN)).toBe(false);
    expect(withinFileCeiling(Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe("admission", () => {
  const base = {
    usedBytes: 0,
    usedDocuments: 0,
    maxBytes: 100 * MB,
    maxDocuments: 10,
  };

  it("admits a file that fits", () => {
    expect(admitVaultUpload({ ...base, size: 5 * MB }).allowed).toBe(true);
  });

  it("counts the incoming file, not just what is already stored", () => {
    /* The failure this guards: a workspace one byte under its allowance
       admitting a 50MB upload and landing over. */
    const verdict = admitVaultUpload({
      ...base,
      usedBytes: 100 * MB - 1,
      size: 50 * MB,
    });
    expect(verdict.allowed).toBe(false);
  });

  it("admits a file that lands exactly on the allowance", () => {
    const verdict = admitVaultUpload({
      ...base,
      usedBytes: 50 * MB,
      size: 50 * MB,
    });
    expect(verdict.allowed).toBe(true);
  });

  it("refuses on the document count even with room to spare in bytes", () => {
    const verdict = admitVaultUpload({
      ...base,
      usedDocuments: 10,
      size: 1024,
    });
    expect(verdict.allowed).toBe(false);
    expect(verdict.error).toContain("10 documents");
  });

  it("refuses an oversized file before any quota arithmetic", () => {
    const verdict = admitVaultUpload({
      ...base,
      maxBytes: HARD_MAX_STORAGE_BYTES,
      size: HARD_MAX_FILE_BYTES + 1,
    });
    expect(verdict.allowed).toBe(false);
    expect(verdict.error).toContain("capped at");
  });

  it("says how much room is actually left when it refuses", () => {
    const verdict = admitVaultUpload({
      ...base,
      usedBytes: 90 * MB,
      size: 20 * MB,
    });
    expect(verdict.allowed).toBe(false);
    expect(verdict.error).toContain("10 MB left");
  });
});

describe("formatBytes", () => {
  it("reads as a person would say it", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(900)).toBe("900 B");
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1.5 * MB)).toBe("1.5 MB");
    expect(formatBytes(2 * 1024 * MB)).toBe("2 GB");
  });

  it("does not render a negative or unreadable size", () => {
    expect(formatBytes(-1)).toBe("0 B");
    expect(formatBytes(Number.NaN)).toBe("0 B");
  });
});
