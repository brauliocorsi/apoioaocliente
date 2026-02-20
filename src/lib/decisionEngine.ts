export interface RuleSuggestion {
  rule: string;
  message: string;
  suggestedTags: string[];
  suggestedClauses: string[];
  suggestedMacro?: string;
}

export interface DecisionRule {
  id: string;
  name: string;
  description: string | null;
  condition_type: string;
  condition_value: string | null;
  condition_extra: Record<string, any>;
  suggested_tag_ids: string[];
  suggested_clause_ids: string[];
  suggested_macro_id: string | null;
  message: string;
  is_active: boolean;
  sort_order: number;
}

function evaluateCondition(rule: DecisionRule, ticket: any, currentTags: string[]): boolean {
  const extra = rule.condition_extra || {};

  switch (rule.condition_type) {
    case "category":
      return ticket.category_id === rule.condition_value;

    case "subcategory":
      return ticket.subcategory_id === rule.condition_value;

    case "payment_method": {
      const categoryMatch = extra.category_id ? ticket.category_id === extra.category_id : true;
      return ticket.payment_method === rule.condition_value && categoryMatch;
    }

    case "field_bool": {
      const categoryMatch = extra.category_id ? ticket.category_id === extra.category_id : true;
      const field = extra.field as string;
      return categoryMatch && !!field && ticket[field] === true;
    }

    case "tag_exists": {
      const categoryMatch = rule.condition_value ? ticket.category_id === rule.condition_value : true;
      const tagsToCheck: string[] = extra.tags || [];
      return categoryMatch && currentTags.some((t) => tagsToCheck.includes(t));
    }

    case "delivery_hours": {
      if (ticket.category_id !== rule.condition_value) return false;
      const requiresField = extra.requires_field as string;
      if (requiresField && !ticket[requiresField]) return false;
      const deliveryDate = new Date(ticket.delivery_date);
      const hoursSince = (Date.now() - deliveryDate.getTime()) / (1000 * 60 * 60);
      const hours = (extra.hours as number) || 48;
      const direction = extra.direction as string;
      if (direction === "after") return hoursSince > hours;
      if (direction === "before") return hoursSince <= hours;
      return false;
    }

    default:
      return false;
  }
}

export class DecisionEngine {
  /** Legacy static method — kept for backward compat, uses hardcoded rules */
  static evaluate(ticket: any, currentTags: string[]): RuleSuggestion[] {
    return [];
  }

  /** Dynamic evaluation from database rules */
  static evaluateRules(ticket: any, currentTags: string[], rules: DecisionRule[]): RuleSuggestion[] {
    const sorted = [...rules].sort((a, b) => a.sort_order - b.sort_order);
    return sorted
      .filter((rule) => rule.is_active && evaluateCondition(rule, ticket, currentTags))
      .map((rule) => ({
        rule: rule.id,
        message: rule.message,
        suggestedTags: rule.suggested_tag_ids || [],
        suggestedClauses: rule.suggested_clause_ids || [],
        suggestedMacro: rule.suggested_macro_id || undefined,
      }));
  }
}
