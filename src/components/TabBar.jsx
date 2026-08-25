const TABS = [
  { key: 'submit', label: 'Submit Update' },
  { key: 'mytasks', label: 'My Tasks' },
  { key: 'mine', label: 'My History' }
];

export default function TabBar({ activeTab, onSelect }) {
  return (
    <div className="tabs" id="tabBar">
      {TABS.map(t => (
        <div
          key={t.key}
          className={`tab ${activeTab === t.key ? 'active' : ''}`}
          onClick={() => onSelect(t.key)}
        >
          {t.label}
        </div>
      ))}
    </div>
  );
}
