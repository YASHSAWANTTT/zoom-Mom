import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useZoomSdk } from '../../contexts/ZoomSdkContext';
import PostClassSummary, { LAST_MEETING_KEY } from './PostClassSummary';

/**
 * Shows post-class recovery when the user leaves the meeting (running context inMeeting → inMainClient).
 */
export default function MomentumPostClassListener() {
  const { runningContext, isTestMode } = useZoomSdk();
  const { isAuthenticated } = useAuth();
  const prevRef = useRef(runningContext);
  const [open, setOpen] = useState(false);
  const [meetingId, setMeetingId] = useState(null);

  useEffect(() => {
    const prev = prevRef.current;
    let momentumOn = false;
    try {
      momentumOn = localStorage.getItem('arlo-zoom-momentum-enabled') === '1';
    } catch {
      momentumOn = false;
    }
    if (
      momentumOn &&
      isAuthenticated &&
      !isTestMode &&
      prev === 'inMeeting' &&
      runningContext === 'inMainClient'
    ) {
      try {
        const id = sessionStorage.getItem(LAST_MEETING_KEY);
        if (id) {
          setMeetingId(id);
          setOpen(true);
        }
      } catch {
        /* ignore */
      }
    }
    prevRef.current = runningContext;
  }, [runningContext, isAuthenticated, isTestMode]);

  if (!isAuthenticated) return null;

  return (
    <PostClassSummary
      open={open}
      meetingId={meetingId}
      onClose={() => setOpen(false)}
    />
  );
}
