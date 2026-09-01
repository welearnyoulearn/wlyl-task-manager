import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  FolderOpen, Calendar, FileText, Users, ClipboardList,
  UserPlus, ShieldCheck, UserCog, Lock, Menu, X
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

const ALL_ITEMS = [...GENERAL_ITEMS, ...ADMIN_ITEMS];

// Single persistent left rail for every signed-in user, replacing the
// former admin-only AdminSidebar - Resources/Meetings are relevant to
// the whole team, so they live here as a "Workspace" group above the
// admin-only tooling (only rendered for isAdmin, same items the old
// AdminSidebar had, plus Admin Resources).
//
// On mobile this collapsed into a full nav grid rendered inline above
// every page's content - for an admin (9 total items) that pushed the
// actual page below the fold on first load, found via a real 390px-wide
// screenshot of Admin Resources showing nothing but nav until the user
// scrolled. Below the 700px breakpoint it's now a compact bar (current
// tab name + a hamburger button) that opens the full nav as a
// slide-down overlay instead of occupying permanent page space -
// closes on selecting an item or tapping outside. Desktop is
// unaffected: mobileOpen only has a visual effect under that
// breakpoint's CSS.
export default function Sidebar({ activeTab, onSelect, isAdmin }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const currentItem = ALL_ITEMS.find(item => item.key === activeTab);

  useEffect(() => {
    setMobileOpen(false);
  }, [activeTab]);

  const handleSelect = (key) => {
    onSelect(key);
    setMobileOpen(false);
  };

  return (
    <>
      <button
        type="button"
        id="sidebarMobileToggle"
        className="sidebar-mobile-toggle"
        onClick={() => setMobileOpen(o => !o)}
        aria-expanded={mobileOpen}
      >
        {currentItem ? (
          <span className="sidebar-mobile-toggle-current">
            <currentItem.icon size={16} strokeWidth={2.25} />
            {currentItem.label}
          </span>
        ) : <span />}
        {mobileOpen ? <X size={18} strokeWidth={2.25} /> : <Menu size={18} strokeWidth={2.25} />}
      </button>
      {mobileOpen && <div className="sidebar-mobile-backdrop" onClick={() => setMobileOpen(false)} />}
      <nav id="appSidebar" className={cn('flex flex-col w-52 shrink-0 pr-4 border-r border-border', mobileOpen && 'sidebar-mobile-open')}>
        <div className="sidebar-section-title">Workspace</div>
        {GENERAL_ITEMS.map(item => (
          <NavItem key={item.key} item={item} activeTab={activeTab} onSelect={handleSelect} />
        ))}
        {isAdmin && (
          <>
            <div className="sidebar-section-title" style={{ marginTop: 20 }}>Admin</div>
            {ADMIN_ITEMS.map(item => (
              <NavItem key={item.key} item={item} activeTab={activeTab} onSelect={handleSelect} />
            ))}
          </>
        )}
      </nav>
    </>
  );
}
