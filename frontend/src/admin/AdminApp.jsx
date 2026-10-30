import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import ProtectedRoute from '../components/ProtectedRoute';
import useDocumentTitle from '../utils/useDocumentTitle';
import AdminLayout from './layouts/AdminLayout';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Transactions from './pages/Transactions';
import Inventory from './pages/Inventory';
import Mechanics from './pages/Mechanics';
import ServiceRequests from './pages/ServiceRequests';

function getAdminDocumentTitle(pathname) {
  if (pathname === '/admin/login') return "Admin sign in | Manoy's";
  if (pathname.startsWith('/admin/transactions') || pathname.startsWith('/admin/reservations')) {
    return "Transactions | Admin | Manoy's";
  }
  if (pathname.startsWith('/admin/inventory')) return "Inventory | Admin | Manoy's";
  if (pathname.startsWith('/admin/mechanics')) return "Mechanics | Admin | Manoy's";
  if (pathname.startsWith('/admin/service-requests')) return "Service requests | Admin | Manoy's";
  return "Dashboard | Admin | Manoy's";
}

function AdminApp() {
  const { pathname } = useLocation();
  useDocumentTitle(getAdminDocumentTitle(pathname));

  return (
    <Routes>
      <Route path="login" element={<Login />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AdminLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="transactions" element={<Transactions />} />
          <Route path="reservations" element={<Navigate to="/admin/transactions?type=items" replace />} />
          <Route path="inventory" element={<Inventory />} />
          <Route path="mechanics" element={<Mechanics />} />
          <Route path="service-requests" element={<ServiceRequests />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}

export default AdminApp;
