import { Icon } from './Icon'
import type { BatchResult } from '../lib/review/batch'

const GATE: Record<string, { label: string; tone: string }> = {
  BLOCKED: { label: '有硬伤', tone: 'blocked' },
  REVIEW_NEEDED: { label: '需复核', tone: 'review' },
  DELIVERABLE: { label: '已查完', tone: 'ok' },
}

/** 一次跑完所有素材的总表：定位到「哪几张不能发」，再从那里进单张评审 */
export default function ReviewAllModal({
  result,
  currentAssetId,
  onPick,
  onClose,
}: {
  result: BatchResult
  currentAssetId?: string
  onPick: (assetId: string) => void
  onClose: () => void
}) {
  const { rows, summary } = result
  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal qv-all" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>全部素材 · 一次看</h2>
          <button className="icon-btn" onClick={onClose} title="关闭">
            <Icon name="close" size={15} />
          </button>
        </div>
        <div className="modal-body">
          <p className="lead">
            共 {summary.assets} 张：{summary.blocked} 张有硬伤、{summary.review} 张需复核、
            {summary.deliverable} 张自动项已查完。合计 {summary.fail} 处硬伤、{summary.warn} 处提示。
          </p>

          <div className="qv-all-list">
            {rows.map((row) => {
              const gate = GATE[row.gate] || GATE.REVIEW_NEEDED
              return (
                <button
                  key={row.assetId}
                  className={`qv-all-row ${row.assetId === currentAssetId ? 'current' : ''}`}
                  onClick={() => onPick(row.assetId)}
                  title={row.error ? `评审失败：${row.error}` : '打开这张素材的评审'}
                >
                  <span className={`qv-gate-pill ${gate.tone}`}>{gate.label}</span>
                  <span className="qv-all-name">{row.assetName}</span>
                  <span className="qv-all-metric mono">
                    {row.counts.FAIL} 硬伤 · {row.counts.WARN} 提示
                  </span>
                  <span className="qv-all-metric mono muted">
                    已测 {row.measured}/{row.total}
                  </span>
                  {row.assetId === currentAssetId && <span className="qv-all-here">当前</span>}
                </button>
              )
            })}
          </div>

          <p className="qv-all-foot">
            批量只跑默认口径（屏幕 / 原尺寸 / 末帧）。要看其他帧或改投放宽度，进单张评审里重算。
          </p>
        </div>
      </div>
    </div>
  )
}
