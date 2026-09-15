"use client";

import * as React from "react";
import { clampToolcraftCanvasZoom } from "../../state/canvas-zoom";
import type { ToolcraftExternalStore } from "../../state/toolcraft-external-store";
import type { ToolcraftPoint } from "../../state/types";
import { getZoomedCanvasOffset } from "./canvas-viewport-geometry";

type CanvasGesturePinchState = {
  anchor: ToolcraftPoint;
  startOffset: ToolcraftPoint;
  startZoom: number;
};

type CanvasGestureEvent = Event & {
  clientX?: number;
  clientY?: number;
  scale?: number;
};

const wheelPinchZoomSensitivity = 0.5;
const wheelCommitIdleMs = 120;

function getNextWheelZoom(
  currentZoom: number,
  deltaY: number,
): number {
  const rawDelta = -deltaY * wheelPinchZoomSensitivity;
  const zoomDelta = Math.trunc(rawDelta) || Math.sign(rawDelta);

  return clampToolcraftCanvasZoom(currentZoom + zoomDelta);
}

export function useCanvasWheelGestures(
  store: ToolcraftExternalStore,
  viewportRef: React.RefObject<HTMLDivElement | null>,
): () => void {
  const gesturePinchRef = React.useRef<CanvasGesturePinchState | null>(null);
  const wheelCommitTimerRef = React.useRef<number | undefined>(undefined);
  const commitPendingWheel = React.useCallback((): void => {
    if (wheelCommitTimerRef.current === undefined) {
      return;
    }

    window.clearTimeout(wheelCommitTimerRef.current);
    wheelCommitTimerRef.current = undefined;
    store.commitTransient("viewport");
  }, [store]);
  const scheduleWheelCommit = React.useCallback((): void => {
    if (wheelCommitTimerRef.current !== undefined) {
      window.clearTimeout(wheelCommitTimerRef.current);
    }

    wheelCommitTimerRef.current = window.setTimeout(() => {
      wheelCommitTimerRef.current = undefined;
      store.commitTransient("viewport");
    }, wheelCommitIdleMs);
  }, [store]);

  React.useEffect(() => {
    const viewportElement = viewportRef.current;

    if (!viewportElement) {
      return undefined;
    }

    const listenerOptions: AddEventListenerOptions = {
      capture: true,
      passive: false,
    };
    const handleWheel = (event: WheelEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      const { offset, zoom } = store.getState().canvas;

      if (!event.ctrlKey && !event.metaKey) {
        store.dispatchTransient({
          offset: {
            x: offset.x - event.deltaX,
            y: offset.y - event.deltaY,
          },
          type: "canvas.setOffset",
        });
        scheduleWheelCommit();
        return;
      }

      const nextZoom = getNextWheelZoom(zoom, event.deltaY);
      scheduleWheelCommit();

      if (nextZoom === zoom) {
        return;
      }

      store.dispatchTransient({
        offset: getZoomedCanvasOffset({
          clientX: event.clientX,
          clientY: event.clientY,
          currentZoom: zoom,
          nextZoom,
          offset,
          viewportElement,
        }),
        type: "canvas.setViewport",
        zoom: nextZoom,
      });
    };

    const handleGestureStart = (event: Event): void => {
      event.preventDefault();

      commitPendingWheel();
      const gestureEvent = event as CanvasGestureEvent;
      const rect = viewportElement.getBoundingClientRect();
      const { offset, zoom } = store.getState().canvas;
      gesturePinchRef.current = {
        anchor: {
          x: gestureEvent.clientX ?? rect.left + rect.width / 2,
          y: gestureEvent.clientY ?? rect.top + rect.height / 2,
        },
        startOffset: offset,
        startZoom: zoom,
      };
    };
    const handleGestureChange = (event: Event): void => {
      event.preventDefault();
      const gesture = gesturePinchRef.current;

      if (!gesture) {
        return;
      }

      const scale = (event as CanvasGestureEvent).scale;

      if (!Number.isFinite(scale) || scale === undefined || scale <= 0) {
        return;
      }

      const zoom = clampToolcraftCanvasZoom(gesture.startZoom * scale);
      store.dispatchTransient({
        offset: getZoomedCanvasOffset({
          clientX: gesture.anchor.x,
          clientY: gesture.anchor.y,
          currentZoom: gesture.startZoom,
          nextZoom: zoom,
          offset: gesture.startOffset,
          viewportElement,
        }),
        type: "canvas.setViewport",
        zoom,
      });
    };
    const handleGestureEnd = (event: Event): void => {
      if (!gesturePinchRef.current) {
        return;
      }

      event.preventDefault();
      gesturePinchRef.current = null;
      store.commitTransient("viewport");
    };

    viewportElement.addEventListener("wheel", handleWheel, listenerOptions);
    viewportElement.addEventListener(
      "gesturestart",
      handleGestureStart,
      listenerOptions,
    );
    viewportElement.addEventListener(
      "gesturechange",
      handleGestureChange,
      listenerOptions,
    );
    viewportElement.ownerDocument.addEventListener(
      "gestureend",
      handleGestureEnd,
      listenerOptions,
    );

    return () => {
      viewportElement.removeEventListener(
        "wheel",
        handleWheel,
        listenerOptions,
      );
      viewportElement.removeEventListener("gesturestart", handleGestureStart, listenerOptions);
      viewportElement.removeEventListener("gesturechange", handleGestureChange, listenerOptions);
      viewportElement.ownerDocument.removeEventListener("gestureend", handleGestureEnd, listenerOptions);

      if (wheelCommitTimerRef.current !== undefined) {
        window.clearTimeout(wheelCommitTimerRef.current);
        wheelCommitTimerRef.current = undefined;
        store.commitTransient("viewport");
      }
      if (gesturePinchRef.current) {
        gesturePinchRef.current = null;
        store.commitTransient("viewport");
      }
    };
  }, [commitPendingWheel, scheduleWheelCommit, store, viewportRef]);

  return commitPendingWheel;
}
