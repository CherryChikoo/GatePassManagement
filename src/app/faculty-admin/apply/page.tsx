import { redirect } from "next/navigation";

// HODs (like the Dean and Director) do not need a gate pass. Faculty pass
// history is in the Requests and Activity tabs.
export default function HodApplyPage() {
  redirect("/faculty-admin");
}
