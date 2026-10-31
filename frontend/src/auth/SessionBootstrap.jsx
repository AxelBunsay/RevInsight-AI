import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { readCustomerAuthAction, customerActionReturnPath } from '../Customer/react/customerAuthAction';
import {
  getAuthToken,
  getSessionRedirect,
  restoreAuthSession
} from './authSession';

export default function SessionBootstrap({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [ready, setReady] = useState(
    () => !getAuthToken('customer') && !getAuthToken('mechanic')
  );

  useEffect(() => {
    const customerToken = getAuthToken('customer');
    const mechanicToken = getAuthToken('mechanic');
    if (!customerToken && !mechanicToken) {
      return undefined;
    }

    let active = true;
    const validate = async () => {
      const [customerResult, mechanicResult] = await Promise.all([
        customerToken
          ? restoreAuthSession('customer', () => api.getCustomerProfile({ suppressAuthRedirect: true }))
          : Promise.resolve({ valid: false }),
        mechanicToken
          ? restoreAuthSession('mechanic', () => api.getMechanicProfile({ suppressAuthRedirect: true }))
          : Promise.resolve({ valid: false })
      ]);
      if (!active) return;

      const pendingAction = readCustomerAuthAction();
      const redirect = getSessionRedirect({
        pathname: location.pathname,
        customerValid: customerResult.valid,
        mechanicValid: mechanicResult.valid,
        customerInvalid: customerResult.invalid,
        mechanicInvalid: mechanicResult.invalid,
        fromPath: location.state?.from
          ? `${location.state.from.pathname}${location.state.from.search || ''}${location.state.from.hash || ''}`
          : null,
        returnTo: new URLSearchParams(location.search).get('returnTo'),
        pendingActionPath: pendingAction ? customerActionReturnPath(pendingAction) : null
      });
      if (redirect && redirect !== `${location.pathname}${location.search}`) {
        navigate(redirect, { replace: true, state: pendingAction ? { resumeAction: true } : undefined });
      }
      setReady(true);
    };

    validate();
    return () => { active = false; };
  }, [location.hash, location.pathname, location.search, location.state, navigate]);

  if (!ready) return <p className="customer-loading">Restoring your session…</p>;
  return children;
}
