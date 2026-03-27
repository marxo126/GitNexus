export function LinkList() {
  const data = fetch('/api/links').then(r => r.json());
  // Access fields that overlap with DOM property names
  console.log(data.type);
  console.log(data.href);
  console.log(data.target);
  console.log(data.label);
  return null;
}
