import { useState } from 'react';
import wlylLogo from './assets/wlyl-logo.png';
import { useAuth } from './context/AuthContext.jsx';
import { TicketDetailProvider } from './context/TicketDetailContext.jsx';
import LoginCorner from './components/LoginCorner.jsx';
import AuthModal from './components/AuthModal.jsx';
import Landing from './components/Landing.jsx';
import TabBar from './components/TabBar.jsx';
import AdminSidebar from './components/AdminSidebar.jsx';
import SubmitUpdateForm from './components/SubmitUpdateForm.jsx';
import MyTasksPanel from './components/MyTasksPanel.jsx';
import MyHistoryPanel from './components/MyHistoryPanel.jsx';
import HistoryPanel from './components/HistoryPanel.jsx';
import ByPersonPanel from './components/ByPersonPanel.jsx';
import TicketDetailPanel from './components/TicketDetailPanel.jsx';
import TasksBoardPanel from './components/TasksBoardPanel.jsx';
import AssignTaskPanel from './components/AssignTaskPanel.jsx';
import ManageAdminsPanel from './components/ManageAdminsPanel.jsx';
import ManageMembersPanel from './components/ManageMembersPanel.jsx';

const ADMIN_ONLY_TABS = new Set(['history', 'byperson', 'manageadmins', 'tasksboard', 'assigntask', 'managemembers']);

export default function App() {
  const { currentUser, isAdmin, restoring } = useAuth();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('submit');

  const selectTab = (tabKey) => {
    if (!currentUser) return;
    if (ADMIN_ONLY_TABS.has(tabKey) && !isAdmin) return;
    setActiveTab(tabKey);
  };

  if (restoring) {
    return (
      <div className="wrap">
        <div className="brand-header">
          <img src={wlylLogo} alt="WLYL logo" className="brand-logo" />
          <div>
            <h1>Weekly Update Tracker</h1>
            <div className="subtitle">Track what your team is working on, every week.</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <TicketDetailProvider activeTab={activeTab} setActiveTab={setActiveTab}>
      <div className="wrap">
        <div className="brand-header">
          <img src={wlylLogo} alt="WLYL logo" className="brand-logo" />
          <div>
            <h1>Weekly Update Tracker</h1>
            <div className="subtitle">Track what your team is working on, every week.</div>
          </div>
        </div>

        <LoginCorner onOpenAuthModal={() => setAuthModalOpen(true)} />
        <AuthModal open={authModalOpen} onClose={() => setAuthModalOpen(false)} />

        {!currentUser ? (
          <Landing onOpenSetup={() => setAuthModalOpen(true)} />
        ) : (
          <div id="appLayout" style={{ display: 'flex' }}>
            {isAdmin && <AdminSidebar activeTab={activeTab} onSelect={selectTab} />}
            <div id="mainContent">
              <TabBar activeTab={activeTab} onSelect={selectTab} />

              <SubmitUpdateForm active={activeTab === 'submit'} />
              <MyTasksPanel active={activeTab === 'mytasks'} />
              <MyHistoryPanel active={activeTab === 'mine'} />
              {isAdmin && <HistoryPanel active={activeTab === 'history'} />}
              {isAdmin && <ByPersonPanel active={activeTab === 'byperson'} />}
              <TicketDetailPanel active={activeTab === 'ticketdetail'} />
              {isAdmin && <TasksBoardPanel active={activeTab === 'tasksboard'} />}
              {isAdmin && <AssignTaskPanel active={activeTab === 'assigntask'} />}
              {isAdmin && <ManageAdminsPanel active={activeTab === 'manageadmins'} />}
              {isAdmin && <ManageMembersPanel active={activeTab === 'managemembers'} />}
            </div>
          </div>
        )}
      </div>
    </TicketDetailProvider>
  );
}
