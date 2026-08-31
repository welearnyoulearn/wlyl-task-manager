import { cn } from '@/lib/utils';
import {
  FolderOpen, Calendar, FileText, Users, ClipboardList,
  UserPlus, ShieldCheck, UserCog, Lock
} from 'lucide-react';

// Visible to every signed-in member - team-wide reference material,
// not admin tooling.
const GENERAL_ITEMS = [
  { key: 'resources', label: 'Resources', icon: FolderOpen },
  { key: 'meetings', label: 'Meetings', icon: Calendar }
];

// Admin-only tooling - unchanged set from the old AdminSidebar, plus
// Admin Resources.
const ADMIN_ITEMS = [
  { key: 'history', label: 'Weekly Reports', icon: FileText },
  { key: 'byperson', label: 'By Person', icon: Users },
  { key: 'tasksboard', label: 'Tasks Board', icon: ClipboardList },
  { key: 'assigntask', label: 'Assign Task', icon: UserPlus },
  { key: 'manageadmins', label: 'Manage Admins', icon: ShieldCheck },
  { key: 'managemembers', label: 'Manage Members', icon: UserCog },
  { key: 'adminresources', label: 'Admin Resources', icon: Lock }
];

function NavItem({ item, activeTab, onSelect }) {
  const Icon = item.icon;
  const isActive = activeTab === item.key;
  return (
    <div
      className={cn('sidebar-tab', isActive && 'active')}
      onClick={() => onSelect(item.key)}
    >
      <Icon size={16} className="sidebar-tab-icon" strokeWidth={2.25} />
      <span>{item.label}</span>
    </div>
  );
}

// Single persistent left rail for every signed-in user, replacing the
// former admin-only AdminSidebar - Resources/Meetings are relevant to
// the whole team, so they live here as a "Workspace" group above the
// admin-only tooling (only rendered for isAdmin, same items the old
// AdminSidebar had, plus Admin Resources).
export default function Sidebar({ activeTab, onSelect, isAdmin }) {
  return (
    <nav id="appSidebar" className="flex flex-col w-52 shrink-0 pr-4 border-r border-border">
      <div className="sidebar-section-title">Workspace</div>
      {GENERAL_ITEMS.map(item => (
        <NavItem key={item.key} item={item} activeTab={activeTab} onSelect={onSelect} />
      ))}
      {isAdmin && (
        <>
          <div className="sidebar-section-title" style={{ marginTop: 20 }}>Admin</div>
          {ADMIN_ITEMS.map(item => (
            <NavItem key={item.key} item={item} activeTab={activeTab} onSelect={onSelect} />
          ))}
        </>
      )}
    </nav>
  );
}
