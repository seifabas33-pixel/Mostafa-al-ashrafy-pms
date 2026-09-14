import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Toasts } from './components/Toasts';
import { ActivitiesPage } from './pages/Activities';
import { BookingEnginePage } from './pages/BookingEngine';
import { ChannelsPage } from './pages/Channels';
import { CompliancePage } from './pages/Compliance';
import { DashboardPage } from './pages/Dashboard';
import { HousekeepingPage } from './pages/Housekeeping';
import { InventoryPage } from './pages/Inventory';
import { NewReservationPage } from './pages/NewReservation';
import { PosPage } from './pages/Pos';
import { PricingPage } from './pages/Pricing';
import { RackPage } from './pages/Rack';
import { ReportsPage } from './pages/Reports';
import { ReservationDetailPage } from './pages/ReservationDetail';
import { ReservationsPage } from './pages/Reservations';
import { SettingsPage } from './pages/Settings';

export function App() {
  return (
    <>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="rack" element={<RackPage />} />
          <Route path="reservations" element={<ReservationsPage />} />
          <Route path="reservations/new" element={<NewReservationPage />} />
          <Route path="reservations/:id" element={<ReservationDetailPage />} />
          <Route path="housekeeping" element={<HousekeepingPage />} />
          <Route path="pos" element={<PosPage />} />
          <Route path="inventory" element={<InventoryPage />} />
          <Route path="activities" element={<ActivitiesPage />} />
          <Route path="compliance" element={<CompliancePage />} />
          <Route path="channels" element={<ChannelsPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="pricing" element={<PricingPage />} />
          <Route path="book" element={<BookingEnginePage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <Toasts />
    </>
  );
}
