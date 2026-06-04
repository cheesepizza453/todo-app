export const CloseIcon = ({ size = 24, color = "currentColor" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M8 8L16 16"
      stroke={color}
      strokeWidth="2.3"
      strokeLinecap="round"
    />
    <path
      d="M16 8L8 16"
      stroke={color}
      strokeWidth="2.3"
      strokeLinecap="round"
    />
  </svg>
);
