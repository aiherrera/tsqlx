/**
 * True if the resolved module id refers to a `.tsq` file (query/hash stripped).
 */
export function isTsqModuleId(id: string): boolean {
  const clean = id.split("?")[0].split("#")[0];
  return clean.endsWith(".tsq");
}
