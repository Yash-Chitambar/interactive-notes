"use client";

// ============================================================
// components/Toast.tsx — simple bottom-center toast notification
// Auto-dismisses after 4 seconds, slides up on enter.
// ============================================================

import { useEffect, useRef, useState } from "react";

export type ToastType = "info" | "success" | "error";

interface ToastProps {
  message: string;
  type?: ToastType;
  onDismiss: () => void;
}

const BG: Record<ToastType, string> = {
  info: "bg-blue-600",
  success: "bg-green-600",
  error: "bg-red-600",
};

export default function Toast({ message, type = "info", onDismiss }: ToastProps) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Trigger slide-up on mount
  useEffect(() => {
    // rAF ensures the initial opacity:0 / translateY frame is painted before
    // we flip to visible, giving the CSS transition something to animate from.
    const raf = requestAnimationFrame(() => setVisible(true));

    timerRef.current = setTimeout(() => {
      setVisible(false);
      // Wait for the slide-down transition to finish before unmounting
      setTimeout(onDismiss, 300);
    }, 4000);

    return () => {
      cancelAnimationFrame(raf);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      onClick={() => {
        setVisible(false);
        setTimeout(onDismiss, 300);
      }}
      className={[
        "fixed bottom-20 left-1/2 z-50 cursor-pointer",
        "-translate-x-1/2",
        "px-5 py-3 rounded-xl shadow-lg",
        "text-white text-sm font-medium max-w-sm text-center",
        "transition-all duration-300 ease-out select-none",
        BG[type],
        visible
          ? "opacity-100 translate-y-0"
          : "opacity-0 translate-y-4 pointer-events-none",
      ].join(" ")}
    >
      {message}
    </div>
  );
}
