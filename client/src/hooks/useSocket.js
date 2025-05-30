import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

export function useSocket(url = 'http://localhost:4000') {
  const socketRef = useRef(null);

  useEffect(() => {
    if (!socketRef.current) {
      socketRef.current = io(url);
    }
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [url]);

  return socketRef.current;
}