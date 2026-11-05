import { requireRole } from "@/lib/auth/helpers";
import { EstateHome } from "./client";

/** Estate Manager home: the 7 books, each with how many entries wait to be verified. */
export default async function EstatePage() {
  await requireRole("ESTATE_MANAGER");
  return <EstateHome />;
}
