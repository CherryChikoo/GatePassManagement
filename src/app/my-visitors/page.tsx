import { listMyVisits } from "@/server/actions/visits";
import { MyVisitorsClient } from "./client";

export const metadata = { title: "My Visitors" };

/** Visitors / admission people who came to meet me, with the meeting codes to give them. */
export default async function MyVisitorsPage() {
  const first = await listMyVisits({ view: "day" });
  return <MyVisitorsClient initial={first} />;
}
