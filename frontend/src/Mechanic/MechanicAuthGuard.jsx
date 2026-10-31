import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { api } from '../services/api';
import { clearAuthSession, getAuthToken, storeAuthUser } from '../auth/authSession';

export default function MechanicAuthGuard({ children }) {
  const location = useLocation();
  const [status, setStatus] = useState(() => getAuthToken('mechanic') ? 'checking' : 'unauthenticated');

  useEffect(() => {
    if (!getAuthToken('mechanic')) return undefined;
    let active = true;
    api.getMechanicProfile().then((response) => {
      if (!active) return;
      storeAuthUser('mechanic', response.mechanic || {});
      setStatus('authenticated');
    }).catch((error) => {
      if (!active) return;
      if (error.status === 401 || error.status === 404) {
        clearAuthSession('mechanic');
        setStatus('unauthenticated');
      } else {
        setStatus('error');
      }
    });
    return () => { active = false; };
  }, []);

  if (status === 'unauthenticated') return <Navigate to="/mechanic/login" replace state={{ from: location }} />;
  if (status === 'checking') return <p className="mechanic-loading">Checking mechanic session…</p>;
  if (status === 'error') return <p className="mechanic-alert" role="alert">Your mechanic session could not be verified. Please try again.</p>;
  return children || <Outlet />;
}