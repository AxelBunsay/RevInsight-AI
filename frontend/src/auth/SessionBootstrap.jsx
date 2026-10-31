import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { readCustomerAuthAction, customerActionReturnPath } from '../Customer/react/customerAuthAction';
import {
  getAuthSessionKind,
  getAuthToken,
  getSessionRedirect,
  restoreAuthSession
} from './authSession';

export default function SessionBootstrap({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [validatedSession, setValidatedSession] = useState(null);
  const kind = getAuthSessionKind(location.pathname);
  const token = kind ? getAuthToken(kind) : null;
  const sessionKey = kind && token ? `${kind}:${token}` : null;

  useEffect(() => {
    if (!kind || !token) {
      return undefined;
    }

    let active = true;
    const validate = async () => {
      const result = await restoreAuthSession(kind, () => kind === 'customer'
        ? api.getCustomerProfile({ suppressAuthRedirect: true })
        : api.getMechanicProfile({ suppressAuthRedirect: true }));
      if (!active) return;

      const pendingAction = kind === 'customer' ? readCustomerAuthAction() : null;
      const redirect = getSessionRedirect({
        pathname: location.pathname,
        customerValid: kind === 'customer' && result.valid,
        mechanicValid: kind === 'mechanic' && result.valid,
        customerInvalid: kind === 'customer' && result.invalid,
        mechanicInvalid: kind === 'mechanic' && result.invalid,
        fromPath: location.state?.from
          ? `${location.state.from.pathname}${location.state.from.search || ''}${location.state.from.hash || ''}`
          : null,
        returnTo: new URLSearchParams(location.search).get('returnTo'),
        pendingActionPath: pendingAction ? customerActionReturnPath(pendingAction) : null
      });
      if (redirect && redirect !== `${location.pathname}${location.search}`) {
        navigate(redirect, { replace: true, state: pendingAction ? { resumeAction: true } : undefined });
      }
      setValidatedSession(`${kind}:${token}`);
    };

    validate();
    return () => { active = false; };
  }, [kind, location.hash, location.pathname, location.search, location.state, navigate, token]);

  if (sessionKey && validatedSession !== sessionKey) {
    return <p className="customer-loading">Restoring your session…</p>;
  }
  return children;
}
