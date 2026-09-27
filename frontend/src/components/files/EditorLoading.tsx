import { Skeleton } from '../../Skeleton'

const LINE_WIDTHS = ['34%', '58%', '47%', null, '66%', '41%', '72%', '52%', null, '29%', '61%', '44%']

export function EditorLoading() {
  return (
    <div className="editor-loading" role="status" aria-label="Loading editor">
      {LINE_WIDTHS.map((width, i) => (
        <div key={i} className="editor-loading-line">
          <span className="editor-loading-gutter">{i + 1}</span>
          {width && <Skeleton width={width} height={9} style={{ animationDelay: `${i * 45}ms` }} />}
        </div>
      ))}
    </div>
  )
}
