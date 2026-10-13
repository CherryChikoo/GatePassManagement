import { redirect } from "next/navigation";

// The student dashboard is the single place to request EXIT and ENTRY passes.
export default function StudentRequestPage() {
  redirect("/student");
}
