import { handleRequest } from './alive-called';
import { processCommand } from './alive-entry';

export function main() {
  const result = handleRequest('test');
  console.log(result);
  processCommand(['arg1']);
}

main();
