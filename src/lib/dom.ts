import type { FocusEvent } from "react";

// The on-screen keyboard covers roughly the bottom third of a phone screen.
// Scrolling the focused field to the top of the visible area (instead of
// centering it) leaves the most room below for whatever it's driving — the
// rest of a set row, or a search result list that shrinks as you type.
// Wait a beat for the keyboard's slide-in animation before measuring.
export function scrollFieldIntoView(e: FocusEvent<HTMLElement>) {
  const el = e.currentTarget;
  setTimeout(() => el.scrollIntoView({ block: "start", behavior: "smooth" }), 250);
}
