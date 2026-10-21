import { describe, expect, it } from "vitest";
import { lineAmounts } from "./line";
import { roundDiv } from "./money";
import type { Settings } from "./types";

// The money functions work in integers held in JavaScript numbers (exact up to 2^53). These tests
// compare them with a reference written with BigInt, which is exact for any size, over many
// random inputs that stay inside the range the API accepts (see apps/api/src/core/validation.ts).

/** Integer division rounded half away from zero, in exact arithmetic. */
function exactRound(n: bigint, d: bigint): bigint {
  const negative = n < 0n;
  const quotient = (2n * (negative ? -n : n) + d) / (2n * d);
  return negative ? -quotient : quotient;
}

/** A small deterministic random generator, so a failure can be reproduced. */
function generator(seed: number) {
  let state = seed;
  const unit = () => ((state = (state * 1664525 + 1013904223) % 4294967296), state / 4294967296);
  return { unit, int: (lo: number, hi: number) => lo + Math.floor(unit() * (hi - lo + 1)) };
}

describe("roundDiv", () => {
  it("equals the exact result, including exact halves and negative numbers", () => {
    const { unit, int } = generator(1);
    for (let i = 0; i < 100_000; i++) {
      const d = [100_000, 10_000, 100, 7, 3, 1_000_000][i % 6]!;
      let n = Math.floor(unit() * 10 ** int(1, 15));
      if (i % 3 === 0 && d % 2 === 0) n = Math.floor(n / d) * d + d / 2; // exactly half a unit
      const exact = Number(exactRound(BigInt(n), BigInt(d)));
      expect([n, d, roundDiv(n, d)]).toEqual([n, d, exact]);
      expect(roundDiv(-n, d) === 0 ? 0 : roundDiv(-n, d)).toBe(exact === 0 ? 0 : -exact);
    }
  });
});

const settings = (vatBaseWhenTotalSponsor: Settings["vatBaseWhenTotalSponsor"]): Settings => ({
  varianceThreshold: 0.15,
  vatBaseWhenTotalSponsor,
  cashSponsorVatRate: 11,
  bankCompare: { summary: "day", timeline: "month" },
  vatReportHorizon: { from: { year: 2026, quarter: 3 }, to: { year: 2027, quarter: 4 } },
});

describe("lineAmounts", () => {
  it("equals the exact calculation for every sponsor type, VAT rate and VAT base", () => {
    const { unit, int } = generator(2);
    for (let i = 0; i < 60_000; i++) {
      const quantityMilli = int(0, [1_000, 100_000, 10_000_000, 1_000_000_000][i % 4]!); // up to 1,000,000 units
      const unitCostE4 = int(0, [10_000, 1_000_000, 100_000_000, 100_000_000_000][(i >> 2) % 4]!); // up to 10,000,000 euros
      if (quantityMilli * unitCostE4 > 1e15) continue; // the API refuses lines above 100,000,000 euros of net cost
      const sponsorType = [null, "none", "partial", "total"][int(0, 3)] as "none" | "partial" | "total" | null;
      const rateHundredths = [null, 0, 1100, 2200, 450, int(0, 10_000)][int(0, 5)] ?? null;
      const mode = unit() < 0.5 ? "net" : "net-minus-sponsor";

      const net = exactRound(BigInt(quantityMilli) * BigInt(unitCostE4), 100_000n);
      const sponsorValueCents = sponsorType === "partial" && net > 0n ? Number(BigInt(int(1, 1_000_000)) % net) + 1 : null;
      const sponsor = sponsorType === "total" ? net : BigInt(sponsorValueCents ?? 0);
      const base = sponsorType === "partial" || (sponsorType === "total" && mode === "net-minus-sponsor") ? net - sponsor : net;
      const vat = sponsorType !== null && rateHundredths !== null ? exactRound(base * BigInt(rateHundredths), 10_000n) : 0n;

      const got = lineAmounts(
        { quantityMilli, unitCostE4, sponsorType, sponsorValueCents, vatRate: rateHundredths === null ? null : rateHundredths / 100 } as never,
        settings(mode),
      );
      const label = JSON.stringify({ quantityMilli, unitCostE4, sponsorType, sponsorValueCents, rateHundredths, mode });
      expect([label, got.netCents]).toEqual([label, Number(net)]);
      expect([label, got.vatCents]).toEqual([label, Number(vat)]);
      expect([label, got.grossCents]).toEqual([label, Number(net + vat)]);
      expect([label, got.sponsorCents]).toEqual([label, Number(sponsor)]);
      expect([label, got.outflowCents]).toEqual([label, Number(net + vat - sponsor)]);
      expect(got.complete).toBe(sponsorType !== null && rateHundredths !== null);
    }
  });
});
