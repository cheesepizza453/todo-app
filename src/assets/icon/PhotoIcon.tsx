export const PhotoIcon = ({ size = 24, color = "currentColor" }) => (
  /*  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
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
    </svg>*/
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* 밥 */}
    <path
      d="M7.2 10.2C7.2 8.1 8.9 6.4 11 6.4C11.8 6.4 12.4 6.6 13 7C13.5 6.2 14.4 5.7 15.4 5.7C17.1 5.7 18.5 7.1 18.5 8.8C18.5 9.1 18.4 9.4 18.4 9.7C19.5 10.1 20.2 11.1 20.2 12.2H7.4C7.3 11.6 7.2 10.9 7.2 10.2Z"
      fill="white"
      stroke={color}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />

    {/* 그릇 */}
    <path
      d="M5.5 12.3H18.5C18.5 15.8 15.7 18.5 12 18.5C8.3 18.5 5.5 15.8 5.5 12.3Z"
      stroke={color}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />

    {/* 그릇 안쪽 라인 */}
    <path
      d="M7.2 15.3H16.8"
      stroke={color}
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  </svg>
);
