export const TodoIcon = ({ size = 24, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <rect
      x="5"
      y="4"
      width="14"
      height="16"
      rx="4"
      stroke={color}
      strokeWidth="1.8"
    />
    <path
      d="M9 10.2L10.3 11.5L13.3 8.5"
      stroke={color}
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M9 15H15"
      stroke={color}
      strokeWidth="1.7"
      strokeLinecap="round"
    />
  </svg>
);
