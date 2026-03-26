import { validateInput } from './alive-entry';
import { formatOutput } from './unused-exports';

export function handleRequest(input: string): string {
  const valid = validateInput(input);
  if (!valid) return 'invalid';
  return formatOutput(input);
}
