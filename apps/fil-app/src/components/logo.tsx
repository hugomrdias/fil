/**
 * fil-app mark: a brand-blue tile with stacked storage bars.
 *
 * @param props.className - Extra classes.
 */
export function Logo(props: { className?: string }) {
  return (
    <svg
      aria-hidden
      className={props.className}
      fill="none"
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect fill="#0090FF" height="32" rx="6" width="32" />
      <path
        d="M9 10.5h14M9 16h14M9 21.5h9"
        stroke="#fff"
        strokeLinecap="round"
        strokeWidth="2.6"
      />
      <circle cx="22.5" cy="21.5" fill="#83EAFF" r="2" />
    </svg>
  )
}
