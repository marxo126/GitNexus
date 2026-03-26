// These functions are never called by anything

export function unusedHelper(x: number): number {
  return x * 2;
}

export function deprecatedFormat(data: string): string {
  return data.trim().toLowerCase();
}

function internalDead(): void {
  // Not exported, not called
  console.log('dead');
}
