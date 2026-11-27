import { SecurityBookTab } from "../book-tab";

/** Security tab: the daily labour books */
export default function SecurityLaboursPage() {
  return <SecurityBookTab title="Daily labours" keys={["DAILY_LABOUR", "LABOUR_CONTRACT"]} />;
}
