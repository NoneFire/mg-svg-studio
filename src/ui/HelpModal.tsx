import { Icon } from './Icon'

export default function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>这套工具在做什么</h2>
          <button className="icon-btn" onClick={onClose}>
            <Icon name="close" size={15} />
          </button>
        </div>
        <div className="modal-body">
          <p className="lead">
            把 MG 动画里已经在用的 SVG 素材，变成可浏览、可调参、可复用的资产：画布用 LeaferJS 渲染，动画由 GSAP 驱动。
          </p>

          <h3>动画能被“抽出来”的三种情况</h3>
          <div className="help-table">
            <div className="help-row">
              <span className="tag good">CSS @keyframes</span>
              <span>完整解析：时长、延迟、缓动、循环、方向、每条属性的关键帧都会变成侧边栏可编辑的参数。</span>
            </div>
            <div className="help-row">
              <span className="tag good">SMIL</span>
              <span>
                <code>animate</code> / <code>animateTransform</code> 的 values、dur、begin 会转成关键帧轨道。
              </span>
            </div>
            <div className="help-row">
              <span className="tag warn">JS 驱动</span>
              <span>
                GSAP / anime.js 在运行时算出来的动画不在 SVG 文件里，无法自动抽取。工具会照常渲染静态画面，并允许用「添加动画」按元素重建。
              </span>
            </div>
          </div>

          <h3>软面板</h3>
          <p>
            左栏顶部可在「素材」和「图层」之间切换。图层支持搜索、折叠分组和多选。
            用顶部左侧「素材库」和右侧「检查器」打开或收起对应面板。拖动检查器左缘可调宽度，点画布元素也会打开检查器。
          </p>
          <p>
            顶部「播放全部」从头播放所有动画，「全部末帧」暂停并显示每个素材的最后画面。底部时间轴只控制当前素材，拖动它的上边缘可调整高度。画布缩放和网格在顶部工具栏。
          </p>

          <h3>布局与分层</h3>
          <div className="help-table">
            <div className="help-row">
              <span className="tag good">布局内核</span>
              <span>
                选中一个容器 <code>&lt;g&gt;</code>，在「布局」页签里用横向 / 纵向 / 网格加间距重排子元素。坐标由独立内核算出，渲染只负责画。
              </span>
            </div>
            <div className="help-row">
              <span className="tag good">分层动画</span>
              <span>
                同名的逐字动画会自动合并成一条「层」（例如 <code>charIn ×7</code>），改一次时长或关键帧就整层生效，交错延迟单独调。
                手动成层：元素树里 ⌘/Shift 多选后点「合并为一条分层动画」。
              </span>
            </div>
          </div>

          <h3>画布操作</h3>
          <h3>导入</h3>
          <p>
            拖文件进来、点左上角素材库的 <code>+</code>，或者直接 <code>⌘V</code>：支持动画 / 静态 SVG 源码与文件、
            PNG / JPEG / WebP 位图（会自动包成 SVG 素材，可参与布局与画板管理，但内部像素不可编辑）。
          </p>

          <div className="shortcut-grid">
            <span>滚轮 / 触控板</span>
            <em>平移</em>
            <span>⌘ + 滚轮</span>
            <em>以光标为中心缩放</em>
            <span>空格 + 拖拽</span>
            <em>平移画布</em>
            <span>双击素材</span>
            <em>聚焦到该素材</em>
            <span>拖标题</span>
            <em>移动整块素材</em>
            <span>F / ⌘0</span>
            <em>适应画布</em>
            <span>⌘1</span>
            <em>100%</em>
            <span>G</span>
            <em>网格开关</em>
            <span>⌘D / Del</span>
            <em>复制 / 删除素材</em>
            <span>右上角 ☀ / ☾</span>
            <em>切换深色 / 浅色背景</em>
            <span>⌘S / ⌘O</span>
            <em>保存 / 打开项目文件</em>
            <span>顶部「素材库」/「检查器」</span>
            <em>切换左栏或右栏</em>
          </div>

          <h3>渲染与降级</h3>
          <p>
            SVG 会被解析成 Leafer 的图形树，因此可以点选单个元素改样式。渐变、虚线、圆角、混合模式、模糊都已支持；
            <code>pattern</code>、<code>feTurbulence</code> 这类噪点/纹理滤镜、复杂
            <code>mask</code> 会被忽略，并在「素材」面板里标出降级项。
          </p>
          <p className="muted">
            素材与修改保存在本机 IndexedDB，不上传服务器；顶栏「项目」可把整个素材库存成 <code>.mgsvg</code> 文件，
            Agent 可以用 <code>mgsvg</code> CLI 或 MCP 直接改这个文件。
          </p>
        </div>
      </div>
    </div>
  )
}
