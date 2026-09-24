import { AgencyLogo } from "./AgencyLogo";

export function BrandMark({ className = "h-9 w-9" }: { className?: string }) {
  return <AgencyLogo className={className} />;
}
