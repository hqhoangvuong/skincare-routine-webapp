import { describe, expect, it } from "vitest";
import { faceDays } from "./routine";
import { resolveStep } from "./schedule";

const before: [string, string] = ["Serum Vitamin C — Cocoon Nghệ C22", "weeks 1-2"];
const from: [string, string] = ["Serum Niacinamide 15% — Cocoon", "week 3+"];
const threshold = { kind: "threshold" as const, untilWeek: 2, before, from };

const odd: [string, string] = ["Mặt nạ Histolab Peppermint", "odd"];
const even: [string, string] = ["Mặt nạ Histolab Natural White", "even"];
const cycle2 = { kind: "cycle" as const, length: 2 as const, weeks: [odd, even] };
const cycle4weeks: [string, string][] = [["w1", ""], ["w2", ""], ["w3", ""], ["w4", ""]];
const cycle4 = { kind: "cycle" as const, length: 4 as const, weeks: cycle4weeks };

describe("resolveStep", () => {
  it("returns a plain tuple by reference, any week", () => {
    const plain: [string, string] = ["Toner Cocoon Sen", ""];
    expect(resolveStep(plain, 1)).toBe(plain);
    expect(resolveStep(plain, 9)).toBe(plain);
  });

  it("threshold: before through untilWeek, from after", () => {
    expect(resolveStep(threshold, 1)).toBe(before);
    expect(resolveStep(threshold, 2)).toBe(before);
    expect(resolveStep(threshold, 3)).toBe(from);
    expect(resolveStep(threshold, 12)).toBe(from);
  });

  it("cycle length 2: weeks 1,3,5 -> weeks[0]; weeks 2,4 -> weeks[1]", () => {
    expect(resolveStep(cycle2, 1)).toBe(odd);
    expect(resolveStep(cycle2, 2)).toBe(even);
    expect(resolveStep(cycle2, 3)).toBe(odd);
    expect(resolveStep(cycle2, 4)).toBe(even);
    expect(resolveStep(cycle2, 5)).toBe(odd);
  });

  it("cycle length 4: weeks 1..5 -> weeks[0,1,2,3,0]", () => {
    expect(resolveStep(cycle4, 1)).toBe(cycle4.weeks[0]);
    expect(resolveStep(cycle4, 4)).toBe(cycle4.weeks[3]);
    expect(resolveStep(cycle4, 5)).toBe(cycle4.weeks[0]);
  });
});

describe("the two authored routine conditionals", () => {
  it("Wednesday AM serum: Vitamin C weeks 1-2, Niacinamide week 3+", () => {
    const step = faceDays[2].am[2];
    expect(resolveStep(step, 1)[0]).toBe("Serum Vitamin C — Cocoon Nghệ C22");
    expect(resolveStep(step, 2)[1]).toContain("Tuần 1–2");
    expect(resolveStep(step, 3)[0]).toBe("Serum Niacinamide 15% — Cocoon");
  });

  it("Sunday PM mask: Peppermint weeks 1 & 3, Natural White weeks 2 & 4", () => {
    const step = faceDays[6].pm[3];
    expect(resolveStep(step, 1)[0]).toBe("Mặt nạ Histolab Peppermint");
    expect(resolveStep(step, 3)[0]).toBe("Mặt nạ Histolab Peppermint");
    expect(resolveStep(step, 2)[0]).toBe("Mặt nạ Histolab Natural White");
    expect(resolveStep(step, 4)[0]).toBe("Mặt nạ Histolab Natural White");
  });
});
