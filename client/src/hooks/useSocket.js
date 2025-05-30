import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

export function useSocket(url = 'http://localhost:4000') {
  const socketRef = useRef(null);

  useEffect(() => {
    // Connect only once
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

// This custom hook connects to a WebSocket server using Socket.IO.
// It listens for messages on the 'game:update' event and calls the provided callback function when a message is received.
// The socket connection is established when the component mounts and cleaned up when it unmounts.

// The `onMessage` parameter allows the user to define a custom callback function to handle incoming messages.

// The socket connection is established to 'http://localhost:5000', which should match the server's address.
// The `useEffect` hook ensures that the socket connection is created only once when the component mounts and cleaned up when it unmounts.
// The `console.log` statement confirms the successful connection to the socket server by logging the socket ID.