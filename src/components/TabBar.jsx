import { Send, BarChart3, ListChecks, History } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

const TABS = [
  { key: 'submit', label: 'Submit Update', icon: Send },
  { key: 'summary', label: 'Weekly Summary', icon: BarChart3 },
  { key: 'mytasks', label: 'My Tasks', icon: ListChecks },
  { key: 'mine', label: 'My History', icon: History }
];

// Uses shadcn's Tabs for the trigger/list styling and keyboard behavior,
// but not TabsContent - every panel in this app stays mounted at all
// times (each has its own `active` prop and internal load-on-active
// effect, see App.jsx), which Radix's TabsContent (unmounts inactive
// panels) would break. onValueChange just calls through to the existing
// onSelect callback, same as the old onClick-per-tab did.
//
// Resources/Meetings moved to the left Sidebar (they're reference
// material, not part of the day-to-day submit/track workflow these four
// tabs cover) - see Sidebar.jsx.
export default function TabBar({ activeTab, onSelect }) {
  return (
    <Tabs id="tabBar" value={activeTab} onValueChange={onSelect} className="mb-5">
      <TabsList className="h-auto w-full justify-start gap-1.5 bg-transparent p-0 pb-1 border-b border-border rounded-none overflow-x-auto flex-nowrap [-webkit-overflow-scrolling:touch]">
        {TABS.map(t => {
          const Icon = t.icon;
          return (
            <TabsTrigger
              key={t.key}
              value={t.key}
              className="shrink-0 whitespace-nowrap gap-2 rounded-full px-4 py-2 text-sm font-semibold text-muted-foreground border border-transparent transition-all duration-150 hover:text-foreground hover:bg-accent data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md data-[state=active]:shadow-primary/25 data-[state=active]:scale-[1.03]"
            >
              <Icon size={15} strokeWidth={2.25} />
              {t.label}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}
