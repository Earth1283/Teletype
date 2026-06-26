export function Skeleton({
  width,
  height = 16,
  radius,
  style,
}: {
  width?: number | string
  height?: number | string
  radius?: number | string
  style?: React.CSSProperties
}) {
  return (
    <div
      className="skeleton"
      style={{
        width: width ?? '100%',
        height,
        borderRadius: radius ?? undefined,
        flexShrink: 0,
        ...style,
      }}
    />
  )
}
