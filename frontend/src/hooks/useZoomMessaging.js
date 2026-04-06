import { useCallback, useEffect, useRef } from 'react';
import { useZoomSdk } from '../contexts/ZoomSdkContext';
import { parseClassroomMessage } from '../protocol/classroomMessages';

/**
 * Thin wrapper around zoomSdk.postMessage / onMessage with optional JSON parsing.
 *
 * @param {(parsed: { ok: boolean, msg?: object, error?: string }, raw: unknown) => void} [onMessageCb]
 */
export function useZoomMessaging(onMessageCb) {
  const { zoomSdk, isTestMode } = useZoomSdk();
  const cbRef = useRef(onMessageCb);
  cbRef.current = onMessageCb;

  useEffect(() => {
    if (isTestMode || !zoomSdk?.onMessage) return undefined;

    const handler = (event) => {
      const raw =
        event?.payload?.payload ??
        event?.payload ??
        event?.message ??
        event?.data ??
        event;
      if (cbRef.current) {
        const parsed = parseClassroomMessage(raw);
        cbRef.current(parsed, raw);
      }
    };

    zoomSdk.onMessage(handler);
    return undefined;
  }, [zoomSdk, isTestMode]);

  const send = useCallback(
    async (payload) => {
      if (isTestMode) {
        console.warn('[useZoomMessaging] test mode — message not sent', payload);
        return { ok: false, error: 'test_mode' };
      }
      if (!zoomSdk?.postMessage) {
        return { ok: false, error: 'no_postMessage' };
      }
      try {
        const pl =
          typeof payload === 'string'
            ? (() => {
                try {
                  return JSON.parse(payload);
                } catch {
                  return { body: payload };
                }
              })()
            : payload;
        await zoomSdk.postMessage({ payload: pl });
        return { ok: true };
      } catch (e) {
        console.error('[useZoomMessaging] postMessage failed', e);
        return { ok: false, error: e?.message || 'postMessage failed' };
      }
    },
    [zoomSdk, isTestMode]
  );

  return { send, parseClassroomMessage };
}

export default useZoomMessaging;
