export const PhotoIcon = ({ size = 24, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <rect
      x="4"
      y="5"
      width="16"
      height="14"
      rx="4"
      stroke={color}
      strokeWidth="1.8"
    />
    <circle
      cx="9"
      cy="10"
      r="1.5"
      stroke={color}
      strokeWidth="1.6"
    />
    <path
      d="M6.5 16.8L10.1 13.2C10.6 12.7 11.4 12.7 11.9 13.2L14 15.3L15.1 14.2C15.6 13.7 16.4 13.7 16.9 14.2L19 16.3"
      stroke={color}
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
