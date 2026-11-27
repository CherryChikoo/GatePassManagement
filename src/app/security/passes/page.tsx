import { ScrollText } from "lucide-react";
import { getT } from "@/lib/i18n/server";
import { SecurityBookTab, TabLink } from "../book-tab";

/** Security tab: every pass book (hostel outings, faculty, students, home outing counts) and the gate logs */
export default async function SecurityPassesPage() {
  const t = await getT();
  return (
    <SecurityBookTab
      title="Passes"
      keys={["BOYS_HOSTEL_OUTING", "LADIES_HOSTEL_OUTING", "FACULTY_BOOK", "STUDENT_BOOK", "HOME_OUTING_SUMMARY"]}
      footer={<TabLink href="/security/log" label={t("Gate Logs")} icon={<ScrollText />} />}
    />
  );
}
