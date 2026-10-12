import { ScannerClient } from "./ScannerClient";
import { PageHeader } from "@/components/ui/states";

export default function ScannerPage() {
  return (
    <div>
      <PageHeader
        title="Barcode Scanner"
        description="Scan a barcode or QR code, then explicitly confirm a Stock In or Stock Out."
      />
      <ScannerClient />
    </div>
  );
}
