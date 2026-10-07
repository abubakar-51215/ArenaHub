/**
 * The admin prototype's court drawings for the arena cards (courtArt() in
 * design/prototypes/arena-hub-admin.html), copied path for path: cricket,
 * padel and badminton have their own; every other sport (football, futsal,
 * ...) gets the football pitch, as in the prototype.
 */
export function CourtArt({ sport }: { sport?: string }) {
  const s = (sport ?? "").toLowerCase();
  const common = {
    viewBox: "0 0 300 120",
    preserveAspectRatio: "none",
    "aria-hidden": true,
  } as const;
  if (s === "cricket")
    return (
      <svg {...common}>
        <rect width="300" height="120" fill="#0F1A15" />
        <ellipse
          cx="150"
          cy="60"
          rx="180"
          ry="110"
          fill="none"
          stroke="#C4F546"
          strokeOpacity=".2"
          strokeWidth="2"
        />
        <rect
          x="120"
          y="18"
          width="60"
          height="84"
          fill="none"
          stroke="#EAF6D8"
          strokeOpacity=".3"
          strokeWidth="2"
        />
        <g stroke="#C4F546" strokeOpacity=".8" strokeWidth="2.5">
          <path d="M141 92v-16M150 92v-16M159 92v-16" />
        </g>
      </svg>
    );
  if (s === "padel")
    return (
      <svg {...common}>
        <rect width="300" height="120" fill="#0F1A15" />
        <rect
          x="34"
          y="16"
          width="232"
          height="88"
          fill="none"
          stroke="#EAF6D8"
          strokeOpacity=".3"
          strokeWidth="2"
          rx="2"
        />
        <path d="M150 16v88" stroke="#C4F546" strokeOpacity=".6" strokeWidth="2" />
        <path
          d="M34 60h232M82 16v88M218 16v88"
          stroke="#EAF6D8"
          strokeOpacity=".18"
          strokeWidth="1.5"
        />
      </svg>
    );
  if (s === "badminton")
    return (
      <svg {...common}>
        <rect width="300" height="120" fill="#0F1A15" />
        <rect
          x="60"
          y="14"
          width="180"
          height="92"
          fill="none"
          stroke="#EAF6D8"
          strokeOpacity=".3"
          strokeWidth="2"
        />
        <path d="M150 14v92" stroke="#C4F546" strokeOpacity=".6" strokeWidth="2" />
        <path
          d="M60 40h180M60 80h180M105 14v92M195 14v92"
          stroke="#EAF6D8"
          strokeOpacity=".18"
          strokeWidth="1.5"
        />
      </svg>
    );
  return (
    <svg {...common}>
      <rect width="300" height="120" fill="#0F1A15" />
      <rect
        x="26"
        y="14"
        width="248"
        height="92"
        fill="none"
        stroke="#EAF6D8"
        strokeOpacity=".3"
        strokeWidth="2"
        rx="2"
      />
      <path d="M150 14v92" stroke="#EAF6D8" strokeOpacity=".3" strokeWidth="2" />
      <circle
        cx="150"
        cy="60"
        r="24"
        fill="none"
        stroke="#C4F546"
        strokeOpacity=".55"
        strokeWidth="2"
      />
      <circle cx="150" cy="60" r="3" fill="#C4F546" />
      <path
        d="M26 40h26v40H26M274 40h-26v40h26"
        fill="none"
        stroke="#EAF6D8"
        strokeOpacity=".3"
        strokeWidth="2"
      />
    </svg>
  );
}
