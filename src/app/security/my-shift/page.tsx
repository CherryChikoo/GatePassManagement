import { MyShiftView } from "@/components/registers/my-shift";

/**
 * My shift details: every security guard's own duties, with Start / End.
 * No server work here (the Security layout already checks the account, and
 * the duty data is checked again by its own request), so the page opens at once.
 */
export default function MyShiftPage() {
  return <MyShiftView />;
}
