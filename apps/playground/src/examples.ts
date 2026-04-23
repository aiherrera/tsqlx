import orders from "../../../examples/orders.tsq?raw";
import paginatedList from "../../../examples/paginated-list.tsq?raw";
import pestReportDemo from "../../../examples/pest-report-demo.tsq?raw";
import sessions from "../../../examples/sessions.tsq?raw";
import users from "../../../examples/users.tsq?raw";

export type ExampleId = "paginated" | "users" | "orders" | "sessions" | "pest";

/** Repository examples + classic pest report demo. */
export const PLAYGROUND_EXAMPLES: {
  id: ExampleId;
  label: string;
  content: string;
}[] = [
  {
    id: "paginated",
    label: "Paginated list + filters",
    content: paginatedList,
  },
  { id: "users", label: "Users (by id)", content: users },
  { id: "orders", label: "Orders + join", content: orders },
  { id: "sessions", label: "Sessions (auth-style)", content: sessions },
  {
    id: "pest",
    label: "Pest report (original demo)",
    content: pestReportDemo,
  },
];

/** Default: paginated + filters (best [IF] demo). */
export const DEFAULT_EXAMPLE_ID: ExampleId = "paginated";

export function getExampleContent(id: ExampleId): string {
  const row = PLAYGROUND_EXAMPLES.find((e) => e.id === id);
  return row?.content ?? PLAYGROUND_EXAMPLES[0]!.content;
}
