/// <reference types="vite-plugin-electron/electron-env" />

declare namespace NodeJS {
  interface ProcessEnv {
    /**
     * 已构建的目录结构
     *
     * ```tree
     * ├─┬─┬ dist
     * │ │ └── index.html
     * │ │
     * │ ├─┬ dist-electron
     * │ │ ├── main.js
     * │ │ └── preload.js
     * │
     * ```
     */
    APP_ROOT: string
    /** /dist/ or /public/ */
    VITE_PUBLIC: string
  }
}

// 在渲染器进程中使用，在 `preload.ts` 中暴露方法
interface Window {
  ipcRenderer: Pick<import('electron').IpcRenderer, 'on' | 'once' | 'off' | 'send' | 'invoke'>
  i18n: {
    getLocalesPath: () => Promise<string>
    getLanguage: () => Promise<string>
    changeLanguage: (lng: string) => Promise<string>
  }
  electron: {
    isWinMaxed: () => Promise<boolean>
    winMin: () => void
    winMax: () => void
    winClose: () => void
    openExternal: (params: import('./types').OpenExternalParams) => void
    selectFolder: (params: import('./types').SelectFolderParams) => Promise<string>
    listFilesFromFolder: (
      params: import('./types').ListFilesFromFolderParams,
    ) => Promise<import('./types').ListFilesFromFolderRecord[]>
    edgeTtsGetVoiceList: () => Promise<import('./lib/edge-tts').EdgeTTSVoice[]>
    edgeTtsSynthesizeToBase64: (
      params: import('./tts/types').EdgeTtsSynthesizeCommonParams,
    ) => Promise<string>
    edgeTtsSynthesizeToFile: (
      params: import('./tts/types').EdgeTtsSynthesizeToFileParams,
    ) => Promise<import('./tts/types').EdgeTtsSynthesizeToFileResult>
    renderVideo: (
      params: import('./ffmpeg/types').RenderVideoParams,
    ) => Promise<import('./ffmpeg/types').ExecuteFFmpegResult>
  }
  sqlite: {
    query: (param: import('./sqlite/types').QueryParams) => Promise<any>
    insert: (param: import('./sqlite/types').InsertParams) => Promise<number>
    update: (param: import('./sqlite/types').UpdateParams) => Promise<number>
    delete: (param: import('./sqlite/types').DeleteParams) => Promise<void>
    bulkInsertOrUpdate: (param: import('./sqlite/types').BulkInsertOrUpdateParams) => Promise<void>
  }
  combination: {
    /** 检查组合是否可用（不违反去重规则） */
    check: (
      params: import('./combination/types').CheckCombinationParams,
    ) => Promise<import('./combination/types').CheckCombinationResult>
    /** 记录已使用的组合 */
    record: (params: import('./combination/types').RecordCombinationParams) => Promise<void>
    /** 获取下一个可用组合 */
    getNext: (
      params: import('./combination/types').GetNextCombinationParams,
    ) => Promise<import('./combination/types').GetNextCombinationResult>
    /** 获取组合统计信息 */
    getStats: () => Promise<import('./combination/types').CombinationStatsResult>
    /** 清除所有组合记录 */
    clear: () => Promise<void>
    /** 重置遍历索引 */
    resetIndex: () => Promise<void>
    /** 获取当前遍历索引 */
    getIndex: () => Promise<number>
  }
}
