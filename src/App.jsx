import { useEffect, useRef, useState } from 'react';
import wlylLogo from './assets/wlyl-logo.png';
import { useAuth } from './context/AuthContext.jsx';
import { TicketDetailProvider } from './context/TicketDetailContext.jsx';
import LoginCorner from './components/LoginCorner.jsx';
import AuthModal from './components/AuthModal.jsx';
import Landing from './components/Landing.jsx';
import TabBar from './components/TabBar.jsx';
import Sidebar from './components/Sidebar.jsx';
import SubmitUpdateForm from './components/SubmitUpdateForm.jsx';
import WeeklySummaryForm from './components/WeeklySummaryForm.jsx';
import MyTasksPanel from './components/MyTasksPanel.jsx';
import MyHistoryPanel from './components/MyHistoryPanel.jsx';
import HistoryPanel from './components/HistoryPanel.jsx';
import ByPersonPanel from './components/ByPersonPanel.jsx';
import TicketDetailPanel from './components/TicketDetailPanel.jsx';
import TasksBoardPanel from './components/TasksBoardPanel.jsx';
import AssignTaskPanel from './components/AssignTaskPanel.jsx';
import ManageAdminsPanel from './components/ManageAdminsPanel.jsx';
import ManageMembersPanel from './components/ManageMembersPanel.jsx';
import ResourcesPanel from './components/ResourcesPanel.jsx';
import MeetingsPanel from './components/MeetingsPanel.jsx';
import AdminResourcesPanel from './components/AdminResourcesPanel.jsx';
import { Toaster } from './components/ui/toaster.jsx';

const ADMIN_ONLY_TABS = new Set(['history', 'byperson', 'manageadmins', 'tasksboard', 'assigntask', 'managemembers', 'adminresources']);

export default function App() {
  const { currentUser, isAdmin, restoring } = useAuth();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  // Default landing tab after login is My Tasks for members - a
  // member's most common need on opening the app is "what do I need to
  // do", not the weekly-reporting form, and Submit Update's own empty
  // state (no ticket activity yet this week) could otherwise read as a
  // blank/broken page on first login. Admins land on Tasks Board
  // instead (set below, once isAdmin is actually known) - an admin's
  // most common need is "what's the state of the team's work", not
  // their own personal task list.
  const [activeTab, setActiveTab] = useState('mytasks');
  const didSetInitialTab = useRef(false);

  useEffect(() => {
    if (!restoring && currentUser && !didSetInitialTab.current) {
      didSetInitialTab.current = true;
      if (isAdmin) setActiveTab('tasksboard');
    }
    if (!currentUser) {
      didSetInitialTab.current = false;
    }
  }, [restoring, currentUser, isAdmin]);

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
            <h1>WLYL Hub</h1>
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
            <h1>WLYL Hub</h1>
            <div className="subtitle">Track what your team is working on, every week.</div>
          </div>
        </div>

        <LoginCorner onOpenAuthModal={() => setAuthModalOpen(true)} />
        <AuthModal open={authModalOpen} onClose={() => setAuthModalOpen(false)} />

        {!currentUser ? (
          <Landing onOpenSetup={() => setAuthModalOpen(true)} />
        ) : (
          <div id="appLayout">
            <Sidebar activeTab={activeTab} onSelect={selectTab} isAdmin={isAdmin} />
            <div id="mainContent">
              <TabBar activeTab={activeTab} onSelect={selectTab} />

              <SubmitUpdateForm active={activeTab === 'submit'} />
              <WeeklySummaryForm active={activeTab === 'summary'} />
              <MyTasksPanel active={activeTab === 'mytasks'} />
              <MyHistoryPanel active={activeTab === 'mine'} />
              <ResourcesPanel active={activeTab === 'resources'} />
              <MeetingsPanel active={activeTab === 'meetings'} />
              {isAdmin && <HistoryPanel active={activeTab === 'history'} />}
              {isAdmin && <ByPersonPanel active={activeTab === 'byperson'} />}
              <TicketDetailPanel active={activeTab === 'ticketdetail'} />
              {isAdmin && <TasksBoardPanel active={activeTab === 'tasksboard'} />}
              {isAdmin && <AssignTaskPanel active={activeTab === 'assigntask'} />}
              {isAdmin && <ManageAdminsPanel active={activeTab === 'manageadmins'} />}
              {isAdmin && <ManageMembersPanel active={activeTab === 'managemembers'} />}
              {isAdmin && <AdminResourcesPanel active={activeTab === 'adminresources'} />}
            </div>
          </div>
        )}
      </div>
      <Toaster />
    </TicketDetailProvider>
  );
}
