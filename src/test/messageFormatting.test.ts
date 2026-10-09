import { describe, expect, it } from "vitest";
import { isHtmlContent, sanitizeForDisplay } from "@/lib/messageFormatting";

describe("message presentation", () => {
  it("recognizes standalone line breaks without treating ordinary text as HTML", () => {
    expect(isHtmlContent("Olá<br>Obrigado")).toBe(true);
    expect(isHtmlContent("Encomenda <1234>\nObrigado")).toBe(false);
  });

  it("preserves paragraphs, accents, emphasis, lists and line breaks", () => {
    const html = '<p>Olá, João<br>Obrigado.</p><ul><li><strong>Fotografias</strong></li></ul>';
    expect(sanitizeForDisplay(html)).toBe(html);
  });

  it("removes forced email layout without losing its content", () => {
    const html = sanitizeForDisplay('<table width="900"><tbody><tr><td style="white-space:nowrap;font-size:4px">Descrição</td></tr></tbody></table>');
    expect(html).toContain("Descrição");
    expect(html).not.toMatch(/style=|width=/);
  });

  it("removes scripts, event handlers and unsafe links", () => {
    const html = sanitizeForDisplay('<script>alert(1)</script><img src="photo.png" onerror=alert(1)><a href="javascript:alert(1)">Abrir</a>');
    expect(html).not.toMatch(/<script|onerror|javascript:/);
    expect(html).toContain("Abrir");
  });
});