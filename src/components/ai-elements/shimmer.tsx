import type { HTMLAttributes, ReactNode } from "react";

type ShimmerProps = HTMLAttributes<HTMLSpanElement> & {
  children?: ReactNode;
  duration?: number;
};

/** Lightweight shimmer text treatment; no animation library required. */
export function Shimmer({ children, className = "", duration = 2, style, ...props }: ShimmerProps) {
  return (
    <span
      className={`jarvis-shimmer ${className}`.trim()}
      style={{
        backgroundImage: "linear-gradient(100deg, currentColor 20%, rgba(255,255,255,.38)  forty%, currentColor 60%)".replace(" forty%", " 40%"),
        backgroundSize: "220% 100%",
        backgroundClip: "text",
        WebkitBackgroundClip: "text",
        color: "transparent",
        animation: `jarvis-shimmer ${Math.max(0.6, duration)}s linear infinite`,
        ...style,
      }}
      {...props}
    >
      {children}
      <style>{`@keyframes jarvis-shimmer { from { background-position: 100% 0; } to { background-position: -120% 0; } } @media (prefers-reduced-motion: reduce) { .jarvis-shimmer { animation: none !important; } }`}</style>
    </span>
  );
}

export default Shimmer;
