export function WalkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
         strokeLinecap="round" strokeLinejoin="round" width={15} height={17} aria-hidden>
      <circle cx="13.5" cy="3.6" r="2.1" fill="currentColor" stroke="none" />
      <path d="M13 7.6 9.4 9.9 8 14" />
      <path d="M13 7.6l2.9 1.5L18 12.6" />
      <path d="M13 7.6 11.4 14l-2.7 6.3" />
      <path d="M11.4 14l3 2.1.9 4.2" />
    </svg>
  );
}

export function BikeIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
    strokeLinecap="round" strokeLinejoin="round" width={16} height={16} aria-hidden>
    <circle cx="6" cy="17" r="3.5" /><circle cx="18" cy="17" r="3.5" />
    <path d="m6 17 4-9h4l4 9M8.5 12h7M12 8 10.5 5H14" /><circle cx="15" cy="4" r="1" fill="currentColor" />
  </svg>;
}

/** A real chevron. The "⌄" character sits on the text baseline and drifts with
 *  the font, which is why the summary row looked crooked. */
export function Chevron() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2}
         strokeLinecap="round" strokeLinejoin="round" width={13} height={13} aria-hidden>
      <path d="M4 6.5 8 10.5l4-4" />
    </svg>
  );
}

/** The back arrow used by the phone headers.
 *
 *  Drawn rather than typed: the "‹" glyph sits high in its em box, so next to a
 *  17px heading it reads as misaligned however the box is centred. */
export function Back() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}
         strokeLinecap="round" strokeLinejoin="round" width={22} height={22} aria-hidden>
      <path d="M15 5 8 12l7 7" />
    </svg>
  );
}

/** The share glyph: a box with an arrow leaving it. */
export function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
         strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 15V3.5" />
      <path d="m7.8 7.7 4.2-4.2 4.2 4.2" />
      <path d="M5 13.5V19a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5.5" />
    </svg>
  );
}
