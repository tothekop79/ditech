import { Routes, Route, Navigate } from 'react-router-dom';
import CommandCenterPage from './pages/CommandCenterPage';
import CommandWallPage from './pages/CommandWallPage';
import { useAuth } from './features/auth/useAuth';
import { Login } from './pages/Login';
import { NewEventWizard } from './pages/NewEventWizard';
import { EventDetailPage } from './pages/EventDetailPage';
import { EventsListPage } from './pages/EventsListPage';
import { Layout } from './components/Layout';
import { CalendarPage } from './pages/CalendarPage';
import { GanttPage } from './pages/GanttPage';
import { MapPage } from './pages/MapPage';
import { CapacityPage } from './pages/CapacityPage';
import { AlertsPage } from './pages/AlertsPage';
import { ImportPage } from './pages/ImportPage';
import { ReportsPage } from './pages/ReportsPage';
import { NotifyPage } from './pages/NotifyPage';
import { UsersPage } from './pages/UsersPage';
import { TeamsPage } from './pages/TeamsPage';
import { PlansListPage } from './pages/PlansListPage';
import { PlanDetailPage } from './pages/PlanDetailPage';
import { CustomersPage } from './pages/CustomersPage';
import { DepartmentsPage } from './pages/DepartmentsPage';
import { ProvincesPage } from './pages/ProvincesPage';
import { DesignEditorPage } from './pages/DesignEditorPage';

export function App() {
  const { token } = useAuth();
  if (!token) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/calendar" replace />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/gantt" element={<GanttPage />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="/capacity" element={<CapacityPage />} />
        <Route path="/alerts" element={<AlertsPage />} />
        <Route path="/import" element={<ImportPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/notify" element={<NotifyPage />} />
        <Route path="/command-center" element={<CommandCenterPage />} />
        <Route path="/command-wall" element={<CommandWallPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/teams" element={<TeamsPage />} />
        <Route path="/provinces" element={<ProvincesPage />} />
        <Route path="/departments" element={<DepartmentsPage />} />
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/plans" element={<PlansListPage />} />
        <Route path="/plans/:id" element={<PlanDetailPage />} />
        <Route path="/events" element={<EventsListPage />} />
        <Route path="/events/new" element={<NewEventWizard />} />
        <Route path="/events/:id" element={<EventDetailPage />} />
        <Route path="/designs/:id" element={<DesignEditorPage />} />
        <Route path="/designs/by-plan/:planId" element={<DesignEditorPage />} />
        <Route path="/designs/by-event/:eventId" element={<DesignEditorPage />} />
        <Route path="*" element={<Navigate to="/calendar" replace />} />
      </Routes>
    </Layout>
  );
}
