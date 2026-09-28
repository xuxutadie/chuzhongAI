"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, PointerEvent, WheelEvent } from "react";

import {
  createNavigationWheelItems,
  getInitialNavigationFocusIndex,
  moveNavigationFocusIndex
} from "./single_navigation_wheel_model";
import type { NavigationGroupSource, NavigationLinkItem } from "./single_navigation_wheel_model";

type SingleNavigationWheelProps = {
  groups: NavigationGroupSource[];
  pathname: string;
};

type DragState = {
  pointerId: number;
  startY: number;
  startFocusIndex: number;
};

const rowHeight = 56;

function getVisualStyle(index: number, focusIndex: number): CSSProperties {
  const distance = index - focusIndex;
  const absoluteDistance = Math.abs(distance);

  return {
    "--wheel-translate-x": `${-Math.min(absoluteDistance * 18, 76)}px`,
    "--wheel-translate-y": `${distance * rowHeight}px`,
    "--wheel-rotation": `${distance * 6.5}deg`,
    "--wheel-opacity": String(Math.max(0.1, 1 - absoluteDistance * 0.17)),
    "--wheel-blur": `${Math.min(absoluteDistance * 0.7, 3.4)}px`,
    "--wheel-scale": String(Math.max(0.7, 1 - absoluteDistance * 0.06))
  } as CSSProperties;
}

export function SingleNavigationWheel({ groups, pathname }: SingleNavigationWheelProps) {
  const items = useMemo(() => createNavigationWheelItems(groups), [groups]);
  const [focusIndex, setFocusIndex] = useState(() => getInitialNavigationFocusIndex(items, pathname));
  const dragStateRef = useRef<DragState | null>(null);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    setFocusIndex(getInitialNavigationFocusIndex(items, pathname));
  }, [items, pathname]);

  const changeFocus = useCallback(
    (delta: number) => {
      setFocusIndex((current) => moveNavigationFocusIndex(items, current, delta));
    },
    [items]
  );

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
      return;
    }

    event.preventDefault();
    changeFocus(event.key === "ArrowUp" ? -1 : 1);
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (event.deltaY === 0) {
      return;
    }

    event.preventDefault();
    changeFocus(event.deltaY > 0 ? 1 : -1);
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    dragStateRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startFocusIndex: focusIndex
    };
    suppressClickRef.current = false;
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const movedDistance = event.clientY - dragState.startY;
    if (Math.abs(movedDistance) < 6) {
      return;
    }

    suppressClickRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    const steps = Math.round(-movedDistance / rowHeight);
    setFocusIndex(moveNavigationFocusIndex(items, dragState.startFocusIndex, steps));
  };

  const handlePointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (dragStateRef.current?.pointerId !== event.pointerId) {
      return;
    }

    dragStateRef.current = null;
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
  };

  return (
    <div
      className="single-navigation-wheel"
      aria-label="学习工作台导航轮"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
    >
      {items.map((item, index) => {
        const visualStyle = getVisualStyle(index, focusIndex);

        if (item.type === "marker") {
          return (
            <span className="navigation-wheel-marker" key={item.id} style={visualStyle}>
              {item.label}
            </span>
          );
        }

        const linkItem = item as NavigationLinkItem;
        const isActive = pathname === linkItem.href;
        const isFocused = index === focusIndex;
        const className = [
          "nav-link",
          linkItem.tone ? `nav-link-${linkItem.tone}` : "",
          isFocused ? "nav-link-is-focused" : ""
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <Link
            aria-current={isActive ? "page" : undefined}
            className={className}
            href={linkItem.href}
            key={linkItem.id}
            onClick={(event) => {
              if (suppressClickRef.current) {
                event.preventDefault();
                return;
              }
              setFocusIndex(index);
            }}
            style={visualStyle}
          >
            <span className="nav-indicator" aria-hidden="true" />
            <span>{linkItem.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
