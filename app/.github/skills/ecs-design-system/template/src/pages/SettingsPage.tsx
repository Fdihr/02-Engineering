import { useState } from "react";
import { AdminLayout } from "@/components/shell/AdminLayout";
import { Button, Field, Input, Section, Select, Switch, Tabs, TabsContent, Textarea, useToast } from "@/components/ui";

/** Administration settings: section nav at the left, Tabs for groups, Field rows, ONE accent Save per view. */
export function SettingsPage() {
  const toast = useToast();
  const [tab, setTab] = useState("general");
  const [saving, setSaving] = useState(false);
  const [notify, setNotify] = useState(true);
  const [name, setName] = useState("My app");

  const save = () => {
    setSaving(true);
    window.setTimeout(() => { setSaving(false); toast("Settings saved", "success"); }, 600);
  };

  return (
    <AdminLayout title="Settings" meta="Applies to everyone who uses this app.">
      <Tabs
        label="Settings"
        value={tab}
        onChange={setTab}
        items={[
          { key: "general", label: "General" },
          { key: "users", label: "Users", count: 12 },
          { key: "integrations", label: "Integrations" },
        ]}
      >
        <TabsContent value="general">
          <Section title="Product" meta="Shown in the top bar and in emails.">
            <div className="grid max-w-xl gap-5">
              <Field label="Product name" hint="Short, sentence case.">
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label="Default view">
                <Select defaultValue="items">
                  <option value="items">Items</option>
                  <option value="reviews">Reviews</option>
                </Select>
              </Field>
              <Field label="Welcome message" optional>
                <Textarea rows={3} placeholder="Shown on Home" />
              </Field>
            </div>
          </Section>
          <Section title="Notifications">
            <div className="flex max-w-xl items-start justify-between gap-6 border-t border-rule py-4">
              <div>
                <p className="text-label font-medium text-ink">Email when a review is waiting</p>
                <p className="mt-0.5 text-meta text-ink-2">Sent once a day, at most.</p>
              </div>
              <Switch checked={notify} onChange={setNotify} ariaLabel="Email when a review is waiting" />
            </div>
          </Section>
          <div className="mt-8 flex gap-3">
            <Button variant="accent" loading={saving} onClick={save}>Save changes</Button>
            <Button variant="ghost">Cancel</Button>
          </div>
        </TabsContent>
        <TabsContent value="users">
          <Section title="Users"><p className="text-ui text-ink-2">Put a Table of users here (see Items).</p></Section>
        </TabsContent>
        <TabsContent value="integrations">
          <Section title="Integrations"><p className="text-ui text-ink-2">One Section per integration, each with its own Save.</p></Section>
        </TabsContent>
      </Tabs>
    </AdminLayout>
  );
}
