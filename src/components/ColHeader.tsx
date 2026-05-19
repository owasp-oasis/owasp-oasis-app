import './ColHeader.css'

interface Props {
  icon: string
  label: string
}

/**
 * A column header that shows an icon and surfaces the full label
 * as a CSS tooltip on hover. Keeps columns narrow while preserving
 * discoverability.
 */
export default function ColHeader({ icon, label }: Props) {
  return (
    <span className="col-header-tip" data-tip={label} aria-label={label}>
      {icon}
    </span>
  )
}
