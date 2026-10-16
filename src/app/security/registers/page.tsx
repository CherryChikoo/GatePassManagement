import { redirect } from "next/navigation";

/** The registers list is the Security home page now. */
export default function RegistersPage() {
  redirect("/security");
}
