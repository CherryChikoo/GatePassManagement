import { redirect } from "next/navigation";

// Students have a single screen (the pass form); there is no separate history page.
export default function StudentHistoryPage() {
  redirect("/student");
}
