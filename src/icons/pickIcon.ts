import type { IconKey } from "./icons";

export function pickIcon(name: string): IconKey {
  const n = name.toLowerCase();
  if (n.includes("cicaplast") || n.includes("baume")) return "balm";
  if (n.includes("tẩy trang") || n.includes("bioderma")) return "micellar";
  if (n.includes("sữa rửa mặt") || n.includes("dermacos")) return "cleanser";
  if (n.includes("toner")) return "toner";
  if (n.includes("tẩy da chết") || n.includes("civasan")) return "exfoliant";
  if (n.includes("serum") || n.includes("niacinamide")) return "serum";
  if (n.includes("gội")) return "toner";
  if (n.includes("xả")) return "toner";
  if (n.includes("bơ")) return "cream";
  if (n.includes("dầu") || n.includes("oil")) return "serum";
  if ((n.includes("kem") || n.includes("cream") || n.includes("gel")) && !n.includes("chống nắng")) return "cream";
  if (n.includes("mặt nạ") || n.includes("mask")) return "mask";
  if (n.includes("chống nắng")) return "sun";
  if (n.includes("nước ấm") || n.includes("rửa mặt")) return "water";
  return "flower";
}
