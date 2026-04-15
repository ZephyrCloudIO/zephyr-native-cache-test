import {useEffect, useRef, useState} from 'react';

// Public endpoint that's lightweight and reliably reachable
const CONNECTIVITY_URL = 'https://clients3.google.com/generate_204';
const POLL_INTERVAL = 5000;

export interface NetworkStatus {
  isOnline: boolean;
}

export function useNetworkStatus(): NetworkStatus {
  const [isOnline, setIsOnline] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    const check = () => {
      fetch(CONNECTIVITY_URL, {method: 'HEAD', cache: 'no-store'})
        .then(() => mountedRef.current && setIsOnline(true))
        .catch(() => mountedRef.current && setIsOnline(false));
    };

    check();
    const id = setInterval(check, POLL_INTERVAL);

    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, []);

  return {isOnline};
}
