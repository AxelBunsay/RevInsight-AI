import { useEffect, useState } from 'react';
import { adminApi } from '../services/adminApi';

function useServiceRevenue(period) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ data: null, loading: true, error: '', requestKey: '' });
  const requestKey = `${period}:${attempt}`;

  useEffect(() => {
    let active = true;
    adminApi.getServiceRevenue(period)
      .then((data) => {
        if (active) setState({ data, loading: false, error: '', requestKey });
      })
      .catch((error) => {
        if (active) setState((current) => ({
          ...current,
          loading: false,
          error: error.message || 'Service revenue could not be loaded.',
          requestKey
        }));
      });

    return () => { active = false; };
  }, [period, attempt, requestKey]);

  return {
    ...state,
    loading: state.loading || state.requestKey !== requestKey,
    error: state.requestKey === requestKey ? state.error : '',
    retry: () => setAttempt((value) => value + 1)
  };
}

export default useServiceRevenue;
