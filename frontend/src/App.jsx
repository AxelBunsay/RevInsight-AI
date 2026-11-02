import { BrowserRouter, Link, Navigate, Routes, Route, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import AuthProvider from './context/AuthProvider';
import { AdminApp } from './admin';
import Cart from './Customer/react/Cart';
import { CustomerLogin, CustomerRegister } from './Customer/react/CustomerAuth';
import CustomerProfile from './Customer/react/Profile';
import MyPurchases from './Customer/react/MyPurchases';
import Landing from './Customer/react/Landing';
import { getLegacyProfilePurchaseRedirect } from './Customer/react/customerPurchases';
import { CustomerAuthGuard, CustomerAuthLayout, CustomerPurchasesRedirect, CustomerRouteLayout } from './Customer/react/CustomerLayout';
import Shop from './Customer/react/Shop';
import Services from './Customer/react/Services';
import ProductDetail from './Customer/react/ProductDetail';
import ServiceDetail from './Customer/react/ServiceDetail';
import Checkout from './Customer/react/Checkout';
import ReservationDetail from './Customer/react/ReservationDetail';
import MechanicLogin from './Mechanic/MechanicLogin';
import MechanicLayout from './Mechanic/MechanicLayout';
import MechanicDashboard from './Mechanic/MechanicDashboard';
import MechanicJobs from './Mechanic/MechanicJobs';
import MechanicProfile from './Mechanic/MechanicProfile';
import MechanicAuthGuard from './Mechanic/MechanicAuthGuard';
import SessionBootstrap from './auth/SessionBootstrap';
import { CustomerPrototypeProvider } from './Customer/react/CustomerPrototypeProvider';
import { CustomerPage } from './Customer/react/CustomerLayout';
import { syncPortalFavicon } from './utils/portalFavicon';
import './Customer/styles/customer-responsive.css';

function PortalFavicon() {
  const { pathname } = useLocation();

  useEffect(() => {
    syncPortalFavicon(pathname);
  }, [pathname]);

  return null;
}

function CustomerProfileRoute() {
  const location = useLocation();
  const legacyRedirect = getLegacyProfilePurchaseRedirect(location.search);
  return legacyRedirect ? <Navigate to={legacyRedirect} replace /> : <CustomerProfile />;
}

function NotFoundPage() {
  return (
    <CustomerPage title="Page not found" description="The page you requested could not be found.">
      <div className="customer-empty">
        <p>Check the address or return to the shop to continue browsing.</p>
        <Link className="customer-primary-button" to="/customer/shop">Back to shop</Link>
      </div>
    </CustomerPage>
  );
}

function App() {
  return (
    <BrowserRouter>
      <PortalFavicon />
      <SessionBootstrap>
        <AuthProvider>
          <CustomerPrototypeProvider>
            <Routes>
          <Route path="/admin/*" element={<AdminApp />} />
        <Route element={<CustomerRouteLayout />}>
          <Route path="/" element={<Landing />} />
        <Route path="/customer" element={<Navigate to="/" replace />} />
        <Route path="/customer/home" element={<Navigate to="/" replace />} />
        <Route element={<CustomerAuthLayout />}>
          <Route path="/customer/login" element={<CustomerLogin />} />
          <Route path="/customer/register" element={<CustomerRegister />} />
        </Route>
        <Route element={<CustomerAuthGuard />}>
          <Route path="/customer/shop" element={<Shop />} />
          <Route path="/customer/cart" element={<Cart />} />
          <Route path="/customer/services" element={<Services />} />
          <Route path="/customer/services/:serviceId" element={<ServiceDetail />} />
          <Route path="/customer/products/:productId" element={<ProductDetail />} />
          <Route path="/customer/orders" element={<Navigate to="/my-purchases?tab=all" replace />} />
          <Route path="/customer/purchases" element={<CustomerPurchasesRedirect />} />
          <Route path="/customer/reservations" element={<Navigate to="/my-purchases?tab=items" replace />} />
          <Route path="/customer/reservations/:reservationId" element={<ReservationDetail />} />
          <Route path="/customer/checkout" element={<Checkout />} />
          <Route path="/customer/profile" element={<CustomerProfileRoute />} />
          <Route path="/my-purchases" element={<MyPurchases />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
        </Route>
        <Route path="/mechanic/login" element={<MechanicLogin />} />
        <Route element={<MechanicAuthGuard><MechanicLayout /></MechanicAuthGuard>}>
          <Route path="/mechanic/dashboard" element={<MechanicDashboard />} />
          <Route path="/mechanic/jobs" element={<MechanicJobs />} />
          <Route path="/mechanic/profile" element={<MechanicProfile />} />
        </Route>
            </Routes>
          </CustomerPrototypeProvider>
        </AuthProvider>
      </SessionBootstrap>
    </BrowserRouter>
  );
}

export default App;