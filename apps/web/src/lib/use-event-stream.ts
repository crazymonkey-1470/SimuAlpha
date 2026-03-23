"use client";

import { useEffect, useRef, useCallback, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const API_PREFIX = "/api/v1";

type EventHandler = (data: unknown) => void;

interface UseEventStreamOptions {
  channel: string;
  onEvent?: Record<string, EventHandler>;
  enabled?: boolean;
}

/**
 * Hook to subscribe to Server-Sent Events from the SimuAlpha API.
 *
 * @param channel - The SSE channel to subscribe to (e.g. "simulation", "jobs", "system")
 * @param onEvent - Map of event type -> handler function
 * @param enabled - Whether the connection is active (default: true)
 */
export function useEventStream({ channel, onEvent, enabled = true }: UseEventStreamOptions) {
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<{ type: string; data: unknown } | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const handlersRef = useRef(onEvent);
  handlersRef.current = onEvent;

  useEffect(() => {
    if (!enabled) {
      esRef.current?.close();
      setConnected(false);
      return;
    }

    const url = `${API_BASE}${API_PREFIX}/events/stream/${encodeURIComponent(channel)}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.addEventListener("connected", () => {
      setConnected(true);
    });

    // Listen for all known event types
    for (const eventType of ["progress", "completed", "failed", "status_update"]) {
      es.addEventListener(eventType, (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          setLastEvent({ type: eventType, data });
          handlersRef.current?.[eventType]?.(data);
        } catch {
          // ignore parse errors
        }
      });
    }

    es.onerror = () => {
      setConnected(false);
    };

    return () => {
      es.close();
      setConnected(false);
    };
  }, [channel, enabled]);

  return { connected, lastEvent };
}
