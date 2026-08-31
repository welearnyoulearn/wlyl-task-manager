import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

const TABS = [
  { key: 'submit', label: 'Submit Update' },
  { key: 'summary', label: 'Weekly Summary' },
  { key: 'mytasks', label: 'My Tasks' },
  { key: 'mine', label: 'My History' },
  { key: 'resources', label: 'Resources' }
];

// Uses shadcn's Tabs for the trigger/list styling and keyboard behavior,
// but not TabsContent - every panel in this app stays mounted at all
// times (each has its own `active` prop and internal load-on-active
// effect, see App.jsx), which Radix's TabsContent (unmounts inactive
// panels) would break. onValueChange just calls through to the existing
// onSelect callback, same as the old onClick-per-tab did.
export default function TabBar({ activeTab, onSelect }) {
  return (
    <Tabs id="tabBar" value={activeTab} onValueChange={onSelect} className="mb-4">
      <TabsList>
        {TABS.map(t => (
          <TabsTrigger key={t.key} value={t.key}>{t.label}</TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
