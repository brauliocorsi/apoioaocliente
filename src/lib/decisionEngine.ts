export interface RuleSuggestion {
  rule: string;
  message: string;
  suggestedTags: string[];
  suggestedClauses: string[];
  suggestedMacro?: string;
}

export class DecisionEngine {
  static evaluate(ticket: any, currentTags: string[]): RuleSuggestion[] {
    const suggestions: RuleSuggestion[] = [];

    // R1 — 48h pós-entrega
    if (ticket.category_id === "B" && ticket.delivery_date) {
      const deliveryDate = new Date(ticket.delivery_date);
      const hoursSince = (Date.now() - deliveryDate.getTime()) / (1000 * 60 * 60);
      if (hoursSince > 48) {
        suggestions.push({
          rule: "R1",
          message: "Reclamação fora das 48h. Pode não ser considerada válida.",
          suggestedTags: ["48h_fora"],
          suggestedClauses: ["V-f"],
          suggestedMacro: "M03",
        });
      } else {
        suggestions.push({
          rule: "R1",
          message: "Reclamação dentro das 48h. Procedimento normal.",
          suggestedTags: ["48h_ok"],
          suggestedClauses: ["V-f", "V-e"],
          suggestedMacro: "M02",
        });
      }
    }

    // R2 — Devolução com montagem
    if (ticket.category_id === "D" && ticket.is_assembled) {
      suggestions.push({
        rule: "R2",
        message: "Produto montado. Devolução não elegível.",
        suggestedTags: [],
        suggestedClauses: ["IX-b", "VII-a"],
        suggestedMacro: "M13",
      });
    }

    // R3 — Personalizado
    if (ticket.is_personalized && ticket.category_id === "D") {
      suggestions.push({
        rule: "R3",
        message: "Produto personalizado. Devolução por arrependimento não aplicável.",
        suggestedTags: ["personalizado"],
        suggestedClauses: ["VII-b", "I-d"],
        suggestedMacro: "M14",
      });
    }

    // R4 — Multibanco na entrega
    if (ticket.payment_method === "multibanco" && ticket.category_id === "F") {
      suggestions.push({
        rule: "R4",
        message: "Pagamento multibanco na entrega requer aviso prévio.",
        suggestedTags: ["tpa_solicitado", "pagamento_entrega"],
        suggestedClauses: ["II-a"],
        suggestedMacro: "M08",
      });
    }

    // R5 — Transferência na entrega
    if (ticket.payment_method === "transferencia" && ticket.category_id === "F") {
      suggestions.push({
        rule: "R5",
        message: "Transferência na entrega não aceite.",
        suggestedTags: ["transferencia_antecipada"],
        suggestedClauses: ["II-c"],
        suggestedMacro: "M09",
      });
    }

    // R6 — Acesso difícil
    if (ticket.subcategory_id === "A4") {
      suggestions.push({
        rule: "R6",
        message: "Acesso difícil: verificar fotos do local e possível termo de responsabilidade.",
        suggestedTags: ["acesso_dificil", "termo_responsabilidade"],
        suggestedClauses: ["V-d", "I-a"],
        suggestedMacro: "M04",
      });
    }

    // R7 — Garantia com exclusões
    if (ticket.category_id === "C") {
      const exclusionTags = ["humidade", "impacto", "limpeza_inadequada"];
      const hasExclusion = currentTags.some((t) => exclusionTags.includes(t));
      if (hasExclusion) {
        suggestions.push({
          rule: "R7",
          message: "Evidência de exclusão de garantia detetada.",
          suggestedTags: ["mau_uso_suspeito"],
          suggestedClauses: ["VI-c", "VI-d"],
          suggestedMacro: "M17",
        });
      }
    }

    return suggestions;
  }
}
