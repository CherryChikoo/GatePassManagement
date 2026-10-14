import { redirect } from "next/navigation";

// The Director does not approve passes; past requests and approvals are in Activity.
export default function DirectorRequestsPage() {
  redirect("/director/activity");
}
