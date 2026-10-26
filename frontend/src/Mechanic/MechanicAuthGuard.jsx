import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { api } from '../services/api';

export default function MechanicAuthGuard({ children }) {
  const location = useLocation();
  const [status, setStatus] = useState(() => localStorage.getItem('mechanicToken') ? 'checking' : 'unauthenticated');

  useEffect(() => {
    if (!localStorage.getItem('mechanicToken')) return undefined;
    let active = true;
    api.getMechanicProfile().then((response) => {
      if (!active) return;
      localStorage.setItem('mechanicUser', JSON.stringify(response.mechanic || {}));
      setStatus('authenticated');
    }).catch((error) => {
      if (!active) return;
      if (error.status === 401 || error.status === 404) {
        localStorage.removeItem('mechanicToken');
        localStorage.removeItem('mechanicUser');
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
  return children;
}