import { cn } from '@/lib/utils';

const ADMIN_TABS = [
  { key: 'history', label: 'Weekly Reports' },
  { key: 'byperson', label: 'By Person' },
  { key: 'tasksboard', label: 'Tasks Board' },
  { key: 'assigntask', label: 'Assign Task' },
  { key: 'manageadmins', label: 'Manage Admins' },
  { key: 'managemembers', label: 'Manage Members' },
  { key: 'adminresources', label: 'Admin Resources' }
];

// A vertical nav list, not a Tabs widget (Radix Tabs assumes one
// horizontal/vertical set representing a single active view, which this
// structurally is - but it lives alongside TabBar's own separate Tabs
// instance, and two independent Radix Tabs roots managing overlapping
// concerns adds complexity with no behavior gain here) - kept as a
// styled nav using the same design tokens instead.
export default function AdminSidebar({ activeTab, onSelect }) {
  return (
    <nav id="adminSidebar" className="flex flex-col w-48 shrink-0 pr-4 border-r border-border">
      <div className="admin-sidebar-title">Admin</div>
      {ADMIN_TABS.map(t => (
        <div
          key={t.key}
          className={cn(
            'px-3 py-2 rounded-md text-sm cursor-pointer text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors',
            activeTab === t.key && 'bg-accent text-primary font-medium'
          )}
          onClick={() => onSelect(t.key)}
        >
          {t.label}
        </div>
      ))}
    </nav>
  );
}
