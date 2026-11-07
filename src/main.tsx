import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { store } from './store'
import './kit.css'
import './styles.css'

const initialTheme = localStorage.getItem('mg-theme') === 'light' ? 'light' : 'dark'
document.documentElement.dataset.theme = initialTheme
document.documentElement.classList.toggle('dark', initialTheme === 'dark')

function showFatal(message: string) {
  let el = document.getElementById('fatal-overlay')
  if (!el) {
    el = document.createElement('div')
    el.id = 'fatal-overlay'
    el.style.cssText =
      'position:fixed;left:12px;bottom:12px;z-index:99999;max-width:70vw;background:#2a1215;color:#ffb4b4;border:1px solid #7f1d1d;border-radius:10px;padding:12px 14px;font:12px/1.6 ui-monospace,monospace;white-space:pre-wrap'
    document.body.appendChild(el)
  }
  el.textContent = '运行错误：' + message
}

window.addEventListener('error', (e) => showFatal(e.message))
window.addEventListener('unhandledrejection', (e: any) => showFatal(String(e.reason?.stack || e.reason)))

// 便于自动化检查
;(window as any).__store = store

createRoot(document.getElementById('root')!).render(<App />)

setTimeout(() => {
  ;(window as any).__state = {
    ready: store.ready,
    assets: store.assets.map((a) => ({ name: a.name, kind: a.kind, groups: a.groups.length, warnings: a.warnings })),
    selection: store.selection,
  }
}, 2500)
