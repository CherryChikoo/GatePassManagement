import { SecurityBookTab } from "../book-tab";

/** Security tab: the Siros books (labour and stock) */
export default function SecuritySirosPage() {
  return <SecurityBookTab title="Siros" keys={["SIROS_DAILY_LABOUR", "SIROS_LABOUR_CONTRACT", "SIROS_STOCK"]} />;
}
