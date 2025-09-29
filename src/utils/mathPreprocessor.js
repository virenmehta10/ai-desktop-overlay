// Math preprocessing utility for LaTeX rendering - ChatGPT style
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

export const preprocessMath = (text) => {
  if (!text || typeof text !== 'string') return text;
  
  let processed = text;
  
  // Remove outer square brackets that sometimes wrap display math
  processed = processed.replace(/\[\s*\$\$(.*?)\$\$\s*\]/g, '$$$1$$');
  
  // Remove parentheses around single-letter variables in prose like (x), (y), (z)
  processed = processed.replace(/\((\s*[a-zA-Z]\s*)\)/g, '$1');
  
  // First, clean up any malformed LaTeX that's causing the messy display
  
  // 1. Remove problematic LaTeX commands that cause messy display
  processed = processed.replace(/\\left\s*\(/g, '(');
  processed = processed.replace(/\\right\s*\)/g, ')');
  processed = processed.replace(/\\left\s*\[/g, '[');
  processed = processed.replace(/\\right\s*\]/g, ']');
  processed = processed.replace(/\\left\s*\{/g, '{');
  processed = processed.replace(/\\right\s*\}/g, '}');
  processed = processed.replace(/\\left\s*\|/g, '|');
  processed = processed.replace(/\\right\s*\|/g, '|');
  
  // 2. Clean up excessive spacing and formatting
  processed = processed.replace(/\\,\s*/g, ' ');
  processed = processed.replace(/\\;\s*/g, ' ');
  processed = processed.replace(/\\:\s*/g, ' ');
  processed = processed.replace(/\\!\s*/g, '');
  
  // 3. Fix malformed integral patterns
  processed = processed.replace(/`\[?\$\$([^$]+)\$\$\$\$([^$]+)\$\$\$\$([^$]+)\$\$\$\$([^$]+),?\s*([^`]+)\]?`/g, (match, p1, p2, p3, p4, p5) => {
    const clean1 = p1.trim();
    const clean2 = p2.trim();
    const clean3 = p3.trim();
    const clean4 = p4.trim();
    const clean5 = p5.replace(/,/g, '').trim();
    
    return `$$\\int_{${clean1}} \\int_{${clean2}} \\int_{${clean3}} ${clean4} ${clean5}$$`;
  });
  
  // 4. Fix patterns like `$$\int_{2}^{3} \int_{-1}^{4} \int_{1}^{0} 4x^2y - z^3 dz dy dx$$`
  processed = processed.replace(/`\[?\$\$([^`]+)\$\$\]?`/g, '$$$1$$');
  
  // 5. Fix triple dollar signs
  processed = processed.replace(/\$\$\$+/g, '$$');
  
  // 6. Fix simple math patterns
  processed = processed.replace(/\$([^$]+)\$/g, '$$$1$$');
  
  // 7. Fix patterns like `x^2 + y^2` (without dollar signs)
  processed = processed.replace(/\b([a-zA-Z])\^(\d+)\s*\+\s*([a-zA-Z])\^(\d+)\b/g, '$$$1^{$2} + $3^{$4}$$');
  
  // 8. Fix patterns like `4x^2y` (coefficients with variables and powers)
  processed = processed.replace(/(\d+)([a-zA-Z])\^(\d+)([a-zA-Z])/g, '$$$1$2^{$3}$4$$');
  
  // 9. Fix patterns like `x^2` (single variables with powers)
  processed = processed.replace(/\b([a-zA-Z])\^(\d+)\b/g, '$$$1^{$2}$$');
  
  // 10. Fix patterns like `z = 0` (without dollar signs)
  processed = processed.replace(/\b([a-zA-Z])\s*=\s*(\d+)\b/g, '$$$1 = $2$$');
  
  // 11. Fix patterns like `\frac{a}{b}` (without dollar signs)
  processed = processed.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '$$\\frac{$1}{$2}$$');
  
  // 12. Fix patterns like `\int_{a}^{b}` (without dollar signs)
  processed = processed.replace(/\\int_\{([^}]+)\}\^\{([^}]+)\}/g, '$$\\int_{$1}^{$2}$$');
  
  // 13. Fix patterns like `\iiint_E` (without dollar signs)
  processed = processed.replace(/\\iiint_([A-Z])/g, '$$\\iiint_{$1}$$');
  
  // 14. Fix patterns like `\iint_D` (without dollar signs)
  processed = processed.replace(/\\iint_([A-Z])/g, '$$\\iint_{$1}$$');
  
  // 15. Fix patterns like `dx dy dz` (differential elements)
  processed = processed.replace(/\b(dx|dy|dz|dV|dA)\b/g, '$$$1$$');
  
  // 16. Fix patterns like `4x^2y - z^3` (complex expressions)
  processed = processed.replace(/(\d+)([a-zA-Z])\^(\d+)([a-zA-Z])\s*-\s*([a-zA-Z])\^(\d+)/g, '$$$1$2^{$3}$4 - $5^{$6}$$');
  
  // 17. Fix patterns like `dz dy dx` (multiple differentials)
  processed = processed.replace(/\b(dx|dy|dz|dV|dA)\s+(dx|dy|dz|dV|dA)\s+(dx|dy|dz|dV|dA)\b/g, '$$$1 $2 $3$$');
  
  // 18. Fix patterns like `dz dy` (two differentials)
  processed = processed.replace(/\b(dx|dy|dz|dV|dA)\s+(dx|dy|dz|dV|dA)\b/g, '$$$1 $2$$');
  
  // 19. Clean up any remaining problematic LaTeX commands
  processed = processed.replace(/\\text\{([^}]+)\}/g, '$1');
  processed = processed.replace(/\\mathrm\{([^}]+)\}/g, '$1');
  processed = processed.replace(/\\mathbf\{([^}]+)\}/g, '$1');
  processed = processed.replace(/\\mathit\{([^}]+)\}/g, '$1');
  
  // 20. Clean up any remaining triple dollar signs
  processed = processed.replace(/\$\$\$\$/g, '$$');
  
  return processed;
};

// Proper math configuration for ReactMarkdown
export const mathConfig = {
  remarkPlugins: [remarkMath],
  rehypePlugins: [
    [rehypeKatex, {
      throwOnError: false,
      errorColor: '#000000',
      strict: false,
      trust: false,
      displayMode: false,
      fleqn: false,
      leqno: false,
      macros: {
        "\\f": "#1f(#2)"
      }
    }]
  ]
};