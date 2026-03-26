// formatOutput IS imported by alive-called.ts — should NOT be detected
export function formatOutput(input: string): string {
  return `[${input}]`;
}

// neverImported is exported but never imported anywhere — unused_export
export function neverImported(): string {
  return 'nobody imports me';
}

// alsoNeverImported is exported but never imported anywhere — unused_export
export function alsoNeverImported(): void {
  console.log('also unused');
}
