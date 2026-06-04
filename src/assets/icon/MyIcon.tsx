export const MyIcon = ({ size = 24, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <circle
      cx="12"
      cy="9"
      r="3.2"
      stroke={color}
      strokeWidth="1.8"
    />
    <path
      d="M5.8 18.5C6.8 15.9 9.1 14.5 12 14.5C14.9 14.5 17.2 15.9 18.2 18.5"
      stroke={color}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
