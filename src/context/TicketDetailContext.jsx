import { createContext, useCallback, useContext, useState } from 'react';

const TicketDetailContext = createContext(null);

// Mirrors the original app's shared Ticket Detail overlay: any ticket-id
// click anywhere in the app opens this view, remembering which tab to
// return to on "Back" regardless of where it was opened from.
export function TicketDetailProvider({ children, activeTab, setActiveTab }) {
  const [ticketDetailId, setTicketDetailId] = useState(null);
  const [returnTab, setReturnTab] = useState(null);

  const openTicketDetail = useCallback((ticketId) => {
    setReturnTab(activeTab);
    setTicketDetailId(ticketId);
    setActiveTab('ticketdetail');
  }, [activeTab, setActiveTab]);

  const closeTicketDetail = useCallback(() => {
    setActiveTab(returnTab || 'submit');
  }, [returnTab, setActiveTab]);

  return (
    <TicketDetailContext.Provider value={{ ticketDetailId, openTicketDetail, closeTicketDetail }}>
      {children}
    </TicketDetailContext.Provider>
  );
}

export function useTicketDetail() {
  const ctx = useContext(TicketDetailContext);
  if (!ctx) throw new Error('useTicketDetail must be used within TicketDetailProvider');
  return ctx;
}
