import { useData } from "vike-react/useData";
import { ShippingPolicyRoute } from "#root/components/template-system/minimal/ShippingPolicyPage";
import type { Data } from "./+data";

export { Page };

function Page() {
  const { facts } = useData<Data>();
  return <ShippingPolicyRoute facts={facts} />;
}
