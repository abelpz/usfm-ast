export function cleanForComparison(obj: any) {
  return JSON.parse(JSON.stringify(obj));
}
