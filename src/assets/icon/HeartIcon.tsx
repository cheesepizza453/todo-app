export const HeartIcon = ({
                            size = 24,
                            color = "currentColor",
                            filled = false,
                          }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M12 20L4.8 13.1C2.5 10.9 2.4 7.2 4.6 5.1C6.8 3 10.2 3.6 12 6.3C13.8 3.6 17.2 3 19.4 5.1C21.6 7.2 21.5 10.9 19.2 13.1L12 20Z"
      fill={filled ? color : "none"}
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
