/**
 * Compliance checker for social media posts
 * Detects potentially non-compliant medical claims
 */

const MEDICAL_GUARANTEE_PATTERNS = [
  // English patterns
  /will\s+prevent\b/i,
  /will\s+cure\b/i,
  /will\s+save\s+(your\s+)?life/i,
  /100%\s+safe/i,
  /guaranteed\s+(to\s+)?(save|protect|prevent)/i,
  /never\s+(have\s+to\s+)?worry\s+again/i,
  /completely\s+safe/i,
  /no\s+risk/i,
  /eliminates?\s+(all\s+)?risk/i,
  /medically\s+proven\s+to/i,
  /clinically\s+proven\s+to\s+(cure|prevent|heal)/i,
  /will\s+definitely/i,
  /ensures?\s+your\s+safety/i,
  
  // Spanish patterns
  /prevendrá\b/i,
  /curará\b/i,
  /salvará\s+(su\s+)?vida/i,
  /100%\s+seguro/i,
  /garantizado\s+(para\s+)?(salvar|proteger|prevenir)/i,
  /nunca\s+(tendrá\s+que\s+)?preocuparse/i,
  /completamente\s+seguro/i,
  /sin\s+riesgo/i,
  /elimina\s+(todo\s+el\s+)?riesgo/i,
  /médicamente\s+probado/i,
  /clínicamente\s+probado\s+para\s+(curar|prevenir)/i,
];

export interface ComplianceWarning {
  pattern: string;
  matchedText: string;
  suggestion: string;
}

export interface ComplianceResult {
  isCompliant: boolean;
  warnings: ComplianceWarning[];
}

/**
 * Check post text for potentially non-compliant medical claims
 */
export function checkPostCompliance(postText: string): ComplianceResult {
  const warnings: ComplianceWarning[] = [];
  
  if (!postText) {
    return { isCompliant: true, warnings: [] };
  }

  for (const pattern of MEDICAL_GUARANTEE_PATTERNS) {
    const match = postText.match(pattern);
    if (match) {
      warnings.push({
        pattern: pattern.source,
        matchedText: match[0],
        suggestion: getSuggestion(match[0]),
      });
    }
  }

  return {
    isCompliant: warnings.length === 0,
    warnings,
  };
}

function getSuggestion(matchedText: string): string {
  const lowerText = matchedText.toLowerCase();
  
  if (lowerText.includes("will prevent") || lowerText.includes("prevendrá")) {
    return "Consider: 'helps provide peace of mind' or 'designed to help in emergencies'";
  }
  if (lowerText.includes("will cure") || lowerText.includes("curará")) {
    return "Avoid medical cure claims. Focus on emergency response capabilities instead.";
  }
  if (lowerText.includes("save") && lowerText.includes("life")) {
    return "Consider: 'helps connect you to emergency services quickly'";
  }
  if (lowerText.includes("100%") || lowerText.includes("completely") || lowerText.includes("completamente")) {
    return "Avoid absolute claims. Consider: 'reliable' or 'trusted'";
  }
  if (lowerText.includes("guaranteed") || lowerText.includes("garantizado")) {
    return "Consider: 'designed to provide reliable emergency support'";
  }
  if (lowerText.includes("no risk") || lowerText.includes("sin riesgo")) {
    return "Consider: 'helps reduce worry' or 'provides peace of mind'";
  }
  
  return "Review this claim for medical compliance. Avoid guaranteeing medical outcomes.";
}
