import { Store, store } from '../src/store'

// 用 tools/cdp.mjs 的临时浏览器运行，避免修改日常工作区。
// node tools/cdp.mjs http://localhost:5173/ 'import("/tools/history-storage-test.ts").then(m => m.runStorageTests())'

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

export async function runStorageTests() {
  check(store.ready, '等待 Studio 初始化后再运行')
  await store.flushWorkspace()
  const template = store.projectJson()
  const runId = crypto.randomUUID()
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('mg-svg-studio', 2)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  const read = <T>(key: string) => new Promise<T>((resolve, reject) => {
    const request = db.transaction('meta').objectStore('meta').get(key)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  const writeMeta = (write: (meta: IDBObjectStore) => void) => new Promise<void>((resolve, reject) => {
    const tx = db.transaction('meta', 'readwrite')
    write(tx.objectStore('meta'))
    tx.oncomplete = () => resolve()
    tx.onabort = () => reject(tx.error)
  })
  const fresh = async () => {
    const session = new Store()
    await session.init()
    return session
  }
  const project = async (name: string) => {
    const session = await fresh()
    await session.loadProjectJson(template, { url: `https://storage-test.invalid/${runId}/${name}` })
    return session
  }
  const activeId = () => read<string>('active-workspace')
  const snapshot = (id: string) => read<{ stamp?: string; assets: { name: string }[]; history: { entries: unknown[] } }>(`workspace:${id}`)
  const passed: string[] = []

  try {
    await project('legacy')
    const legacyId = await activeId()
    await writeMeta((meta) => meta.delete(`workspace-stamp:${legacyId}`))
    const legacy = await fresh()
    await legacy.renameAsset(legacy.assets[0].id, '兼容旧版本号')
    await legacy.flushWorkspace()
    check(!legacy.workspaceSaveFailed, '旧记录缺少独立版本号时应能保存')
    check(await activeId() === legacyId, '旧数据兼容不应创建重复草稿')
    check((await snapshot(legacyId)).assets[0].name === '兼容旧版本号', '旧记录的修改应落盘')
    const withoutStamp = await snapshot(legacyId)
    delete withoutStamp.stamp
    await writeMeta((meta) => {
      meta.delete(`workspace-stamp:${legacyId}`)
      meta.put(withoutStamp, `workspace:${legacyId}`)
    })
    const oldest = await fresh()
    await oldest.renameAsset(oldest.assets[0].id, '兼容无版本号')
    await oldest.flushWorkspace()
    check(!oldest.workspaceSaveFailed && await activeId() === legacyId, '完全没有版本号的旧记录应能保存')
    passed.push('旧记录版本号兼容')

    const a = await project('concurrent')
    const originalId = await activeId()
    const b = await fresh()
    await a.renameAsset(a.assets[0].id, '会话 A')
    await a.flushWorkspace()
    await b.renameAsset(b.assets[0].id, '会话 B')
    const firstWrite = b.flushWorkspace()
    b.endHistoryEdit()
    await b.renameAsset(b.assets[0].id, '会话 B 后续')
    const secondWrite = b.flushWorkspace()
    await Promise.all([firstWrite, secondWrite])
    const forkId = await activeId()
    check(forkId !== originalId, '发生冲突应另存当前会话')
    check((await snapshot(originalId)).assets[0].name === '会话 A', '另一会话的记录应保留')
    check((await snapshot(forkId)).assets[0].name === '会话 B 后续', '冲突会话的排队修改应落盘')
    check(!a.workspaceSaveFailed && !b.workspaceSaveFailed, '版本冲突不应提示存储写入失败')
    b.undo()
    await b.flushWorkspace()
    check(await activeId() === forkId && (await snapshot(forkId)).assets[0].name === '会话 B', '后续撤销应继续写入同一草稿')
    b.redo()
    await b.flushWorkspace()
    const reopened = await fresh()
    check(reopened.assets[0].name === '会话 B 后续' && reopened.canUndo, '重新载入应恢复修改和历史')
    const restoredHistory = reopened.historyEntries.length
    await reopened.loadProjectJson(reopened.projectJson(), { url: `https://storage-test.invalid/${runId}/concurrent` })
    check(reopened.historyEntries.length === restoredHistory, '重新打开同源项目应优先匹配最新草稿')
    passed.push('冲突保留双方修改，后续写入和历史可恢复')

    const io = await project('io')
    const ioId = await activeId()
    const baseline = await snapshot(ioId)
    const put = IDBObjectStore.prototype.put
    try {
      IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
        if (key === `workspace:${ioId}`) throw new DOMException('测试存储空间不足', 'QuotaExceededError')
        return put.call(this, value, key)
      }
      await io.renameAsset(io.assets[0].id, `等待重试的修改 ${runId}`)
      await io.flushWorkspace()
      check(io.workspaceSaveError?.includes('空间不足'), '真实写入错误应给出具体提示')
      check((await snapshot(ioId)).stamp === baseline.stamp, '写入失败时版本号应保持一致')
      check((await snapshot(ioId)).assets[0].name === baseline.assets[0].name, '写入失败时原记录应保持完整')
    } finally {
      IDBObjectStore.prototype.put = put
    }
    await io.flushWorkspace({ retry: true })
    check(!io.workspaceSaveFailed, '重试成功后应清除错误')
    check((await snapshot(ioId)).assets[0].name === `等待重试的修改 ${runId}`, '重试应保存失败期间的修改')
    passed.push('真实写入失败回滚并可重试')

    await io.renameAsset(io.assets[0].id, '排队写入')
    const saving = io.flushWorkspace()
    await io.flushWorkspace()
    check((await snapshot(ioId)).assets[0].name === '排队写入', '没有计时器时 flush 也应等待正在执行的写入')
    await saving
    passed.push('等待正在执行的写入')
    return passed
  } finally {
    db.close()
  }
}
