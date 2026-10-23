import { AppShell } from "@/components/shell/AppShell";
import { Facts, PageHeader, Section } from "@/components/ui";
import { appConfig } from "@/app.config";

export function AboutPage() {
  return (
    <AppShell>
      <PageHeader title={`About ${appConfig.productName}`} parent={{ to: "/", label: "Home" }} />
      <Section title="Version">
        <Facts items={[{ label: "Version", value: "1.0.0" }, { label: "Owner", value: "Your team" }]} />
      </Section>
    </AppShell>
  );
}
