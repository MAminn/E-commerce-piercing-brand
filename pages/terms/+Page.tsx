import { useData } from "vike-react/useData";
import { LegalPageRoute } from "#root/components/template-system/minimal/LegalPage";
import type { Data } from "./+data";

export { Page };

function Page() {
  const { content } = useData<Data>();
  return <LegalPageRoute content={content} />;
}
