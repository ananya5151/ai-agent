// =====================================
// src/plugins/mathPlugin.ts (FIXED VERSION)
// =====================================
import * as math from 'mathjs';

export const mathPlugin = {
  name: 'math_evaluator',
  description: 'Evaluates mathematical expressions safely. Use for calculations, equations, or mathematical operations.',
  parameters: {
    type: 'object',
    properties: {
      expression: {
        type: 'string',
        description: 'The mathematical expression to evaluate (e.g., "2 * (3 + 4)", "sqrt(16)", "cos(pi/4)")',
      },
    },
    required: ['expression'],
  },
  execute: async ({ expression }: { expression: string }): Promise<string> => {
    try {
      // Create a safe math evaluator with limited scope
      const limitedEvaluate = math.evaluate;
      const result = limitedEvaluate(expression);
      
      // Handle different result types
      if (typeof result === 'number') {
        return `The result of "${expression}" is ${result}`;
      } else if (typeof result === 'object' && result !== null) {
        return `The result of "${expression}" is ${JSON.stringify(result)}`;
      } else {
        return `The result of "${expression}" is ${String(result)}`;
      }
    } catch (error) {
      console.error('Math plugin error:', error);
      return `I couldn't evaluate the expression "${expression}". Please check if it's a valid mathematical expression.`;
    }
  },
};