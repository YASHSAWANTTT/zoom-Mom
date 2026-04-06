import { useEffect, useRef } from 'react';
import {
  buildClassroomMessage,
  ClassroomMessageType,
} from '../../protocol/classroomMessages';

/**
 * When the active speaker is a non-host participant, broadcast a timeline mark.
 * `callZoomApi('addParticipantSpotlight')` may be unsupported; failures are ignored.
 */
export function useZoomSpotlight({
  zoomSdk,
  isTestMode,
  enabled,
  isHostLike,
  send,
  onLocalMark,
}) {
  const lastSpeakerRef = useRef(null);

  useEffect(() => {
    if (!enabled || !isHostLike || isTestMode || !zoomSdk?.onActiveSpeakerChange) return undefined;

    const handler = async (event) => {
      const uuid = event?.participantUUID ?? event?.participantId;
      if (!uuid || uuid === lastSpeakerRef.current) return;
      lastSpeakerRef.current = uuid;

      try {
        const res = await zoomSdk.getMeetingParticipants?.();
        const participants = res?.participants || [];
        const active = participants.find(
          (p) => p.participantUUID === uuid || String(p.participantID) === String(uuid)
        );
        if (!active || active.isHost || active.isCoHost) return;

        let spotlighted = false;
        try {
          if (typeof zoomSdk.callZoomApi === 'function') {
            await zoomSdk.callZoomApi('addParticipantSpotlight');
            spotlighted = true;
          }
        } catch {
          spotlighted = false;
        }

        const mark = {
          ts: Date.now(),
          name: active.screenName || 'Student',
          spotlighted,
        };
        onLocalMark?.(mark);
        send(
          buildClassroomMessage(ClassroomMessageType.STUDENT_QUESTION_MARK, {
            tStartMs: mark.ts,
            name: mark.name,
          })
        );
      } catch {
        const mark = { ts: Date.now(), name: 'Student' };
        onLocalMark?.(mark);
        send(
          buildClassroomMessage(ClassroomMessageType.STUDENT_QUESTION_MARK, {
            tStartMs: mark.ts,
          })
        );
      }
    };

    zoomSdk.onActiveSpeakerChange(handler);
    return undefined;
  }, [
    enabled,
    isHostLike,
    isTestMode,
    zoomSdk,
    send,
    onLocalMark,
  ]);
}
