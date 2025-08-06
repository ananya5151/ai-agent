import { evaluate } from 'mathjs';

export const mathPlugin = {
  name: 'math_evaluator',
  description: 'Evaluates a mathematical expression and returns the result. Example: "2 * (3 + 4)"',
  parameters: {
    type: 'object',
    properties: {
      expression: {
        type: 'string',
        description: 'The mathematical expression to evaluate.',
      },
    },
    required: ['expression'],
  },
  execute: async ({ expression }: { expression: string }) => {
    try {
      const result = evaluate(expression);
      return `The result of the expression "${expression}" is ${result}.`;
    } catch (error) {
      return `Sorry, I could not evaluate the expression: "${expression}". It might be invalid.`;
    }
  },
};