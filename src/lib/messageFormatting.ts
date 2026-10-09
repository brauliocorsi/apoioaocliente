import DOMPurify from "dompurify";

/** Presentation only: never mutate the stored message or interpret plain text as HTML. */
export function isHtmlContent(text: string): boolean {
  return /<(?:p|div|br|span|html|body|table|ul|ol|li|blockquote|strong|b|em|i|a|img|pre|h[1-6])(?:\s[^>]*|\s*\/?)>/i.test(text);
}

export function sanitizeForDisplay(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["style", "form", "input", "button", "textarea", "select", "video", "audio"],
    // Email layout styles often force fixed widths, tiny fonts or invisible text.
    // Semantic tags (paragraphs, lists, emphasis, tables) retain their meaning.
    FORBID_ATTR: ["style", "width", "height", "bgcolor", "color", "face", "size", "class", "id"],
  });
}