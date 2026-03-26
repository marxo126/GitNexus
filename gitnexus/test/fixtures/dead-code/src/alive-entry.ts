export function validateInput(input: string): boolean {
  return input.length > 0;
}

// This is an entry point function (called from index.ts indirectly)
export function processCommand(args: string[]): void {
  for (const arg of args) {
    validateInput(arg);
  }
}
