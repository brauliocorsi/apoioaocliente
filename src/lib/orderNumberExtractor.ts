// Phase 4 — Order number extraction helper.
//
// Conservative extractor: returns one of
//   { status: "none" }                            — nothing recognizable
//   { status: "single", number: "12345" }         — exactly one candidate
//   { status: "multiple", candidates: [...] }     — several distinct candidates
//
// Rules:
//   - Accept 3 to 10 digit numbers preceded by an order-like keyword.
//   - Strip obvious Portuguese phone numbers (9 digits starting with 2/9) BEFORE
//     extracting, to avoid mistaking phones for order numbers.
//   - Never auto-pick when there are multiple distinct candidates.

const KEYWORD_PATTERNS = [
  // encomenda, encomenda nº, encomenda n°, encomenda #
  /\b(?:encomenda|pedido|order|ordem(?:\s+de\s+servi[cç]o)?|os|nº\s*encomenda|n[º°ºo°]\s*encomenda)\b[\s.:#nºo°-]{0,8}(\d{3,10})\b/gi,
  // generic "#12345" right after order-y keywords (covered above) and bare "encomenda 12345" already handled
];

const PT_PHONE_RE = /\b(?:\+?351[\s.-]?)?[29]\d{2}[\s.-]?\d{3}[\s.-]?\d{3}\b/g;

export type ExtractionResult =
  | { status: "none" }
  | { status: "single"; number: string }
  | { status: "multiple"; candidates: string[] };

export function extractOrderNumberFromText(input: string | null | undefined): ExtractionResult {
  if (!input || typeof input !== "string") return { status: "none" };

  // Remove Portuguese phone numbers first so their digits cannot leak through.
  const cleaned = input.replace(PT_PHONE_RE, " ");

  const found = new Set<string>();
  for (const pat of KEYWORD_PATTERNS) {
    // reset lastIndex because /g
    pat.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pat.exec(cleaned)) !== null) {
      const num = m[1];
      if (num && num.length >= 3 && num.length <= 10) found.add(num);
    }
  }

  if (found.size === 0) return { status: "none" };
  if (found.size === 1) return { status: "single", number: [...found][0] };
  return { status: "multiple", candidates: [...found] };
}

// Convenience: scan a list of text sources in priority order and return the
// first extraction that yields a unique single match. If any source produces
// multiple candidates, surface that so the caller can mark `multiple_matches`.
export function extractOrderNumberFromSources(sources: Array<string | null | undefined>): ExtractionResult {
  let multiple: ExtractionResult | null = null;
  for (const s of sources) {
    const r = extractOrderNumberFromText(s);
    if (r.status === "single") return r;
    if (r.status === "multiple" && !multiple) multiple = r;
  }
  return multiple ?? { status: "none" };
}
