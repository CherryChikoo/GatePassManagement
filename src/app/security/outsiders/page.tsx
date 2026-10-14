import { redirect } from "next/navigation";

/** Old address of the Visitors page (kept so bookmarks still work). */
export default function OutsidersRedirect() {
  redirect("/security/visitors");
}
