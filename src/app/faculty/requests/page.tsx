import { redirect } from "next/navigation";

// Faculty no longer approve student passes (students go to their HOD / warden).
export default function FacultyRequestsPage() {
  redirect("/faculty");
}
