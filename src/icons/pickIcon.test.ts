import { describe, expect, it } from "vitest";
import { pickIcon } from "./pickIcon";

describe("pickIcon", () => {
  it.each([
    ["Cicaplast Baume B5", "balm"],
    ["Tẩy trang Bioderma", "micellar"],
    ["Sữa rửa mặt Dermacos", "cleanser"],
    ["Toner Cocoon Sen", "toner"],
    ["Tẩy da chết Civasan 30g", "exfoliant"],
    ["Serum Niacinamide 15% — Cocoon", "serum"],
    ["Dầu gội Loreal Serioxyl Advanced", "toner"],
    ["Dầu xả Dove Derma Scalp", "toner"],
    ["Bơ ủ tóc Mielle", "cream"],
    ["Dầu khô đa năng Nuxe Huile Multi", "serum"],
    ["Winter Melon Gel Cream", "cream"],
    ["Mặt nạ Wonjin phục hồi 8 CICA relaxing", "mask"],
    ["Mặt nạ Histolab Natural White", "mask"],
    ["Mặt nạ Histolab Peppermint", "mask"],
    ["Kem chống nắng SPF 30–50 PA+++", "sun"],
    ["Rửa mặt nhẹ bằng nước ấm", "water"],
    ["Để tóc nghỉ hoàn toàn", "flower"],
    // Synthetic input, not a real product: it is the only kind of string that
    // can distinguish "dau tested before kem" from the reverse. Without it,
    // swapping those two branches passes the whole suite.
    ["Dầu dưỡng dạng kem ban đêm", "serum"],
  ])("maps %s to the %s icon", (name, expected) => {
    expect(pickIcon(name)).toBe(expected);
  });

  it("does not treat sunscreen as a cream despite the word kem", () => {
    expect(pickIcon("Kem chống nắng SPF 30–50 PA+++")).toBe("sun");
  });
});
