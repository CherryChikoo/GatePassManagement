import { MyVisitorsClient } from "./client";

export const metadata = { title: "My Visitors" };

/**
 * Visitors / admission people who came to meet me, with the meeting codes to
 * give them. The list loads in the browser (MyVisitorsClient), so the page opens at once.
 */
export default function MyVisitorsPage() {
  return <MyVisitorsClient />;
}
