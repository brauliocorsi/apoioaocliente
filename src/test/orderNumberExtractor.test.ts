import { describe, it, expect } from "vitest";
import { extractOrderNumberFromText, extractOrderNumberFromSources } from "@/lib/orderNumberExtractor";

describe("extractOrderNumberFromText", () => {
  it("encontra um número de encomenda", () => {
    expect(extractOrderNumberFromText("Olá, encomenda nº 45821 ainda não chegou")).toEqual({ status: "single", number: "45821" });
  });
  it("ignora telefones portugueses", () => {
    expect(extractOrderNumberFromText("Liguem-me para 912 345 678")).toEqual({ status: "none" });
  });
  it("não escolhe quando há vários", () => {
    const r = extractOrderNumberFromText("encomenda 1111 e pedido 2222");
    expect(r.status).toBe("multiple");
  });
  it("lida com vazio", () => {
    expect(extractOrderNumberFromText(null)).toEqual({ status: "none" });
  });
});

describe("extractOrderNumberFromSources", () => {
  it("usa a primeira fonte com resultado único", () => {
    expect(extractOrderNumberFromSources([null, "sem número", "pedido 7788"])).toEqual({ status: "single", number: "7788" });
  });
});
