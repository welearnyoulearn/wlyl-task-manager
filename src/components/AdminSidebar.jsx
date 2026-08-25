const ADMIN_TABS = [
  { key: 'history', label: 'All Updates' },
  { key: 'byperson', label: 'By Person' },
  { key: 'tasksboard', label: 'Tasks Board' },
  { key: 'assigntask', label: 'Assign Task' },
  { key: 'manageadmins', label: 'Manage Admins' },
  { key: 'managemembers', label: 'Manage Members' }
];

export default function AdminSidebar({ activeTab, onSelect }) {
  return (
    <nav id="adminSidebar" style={{ display: 'flex' }}>
      <div className="admin-sidebar-title">Admin</div>
      {ADMIN_TABS.map(t => (
        <div
          key={t.key}
          className={`tab ${activeTab === t.key ? 'active' : ''}`}
          onClick={() => onSelect(t.key)}
        >
          {t.label}
        </div>
      ))}
    </nav>
  );
}
