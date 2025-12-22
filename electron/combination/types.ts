/**
 * 视频组合管理类型定义
 * 用于管理前中后三段视频的组合，避免连续两段重复
 */

/** 组合记录 - 存储两个连续片段的组合 */
export interface CombinationRecord {
  /** 第一个片段的文件名 */
  first: string
  /** 第二个片段的文件名 */
  second: string
  /** 组合类型：front_mid=前中组合, mid_end=中后组合 */
  type: 'front_mid' | 'mid_end'
  /** 创建时间 */
  createdAt?: string
}

/** 检查组合是否可用的参数 */
export interface CheckCombinationParams {
  /** 前段片段文件名 */
  front: string
  /** 中段片段文件名 */
  mid: string
  /** 后段片段文件名 */
  end: string
}

/** 检查组合的返回结果 */
export interface CheckCombinationResult {
  /** 是否可用（不重复） */
  available: boolean
  /** 如果不可用，说明原因 */
  reason?: 'front_mid_exists' | 'mid_end_exists'
}

/** 记录组合的参数 */
export interface RecordCombinationParams {
  /** 前段片段文件名 */
  front: string
  /** 中段片段文件名 */
  mid: string
  /** 后段片段文件名 */
  end: string
}

/** 获取下一个可用组合的参数 */
export interface GetNextCombinationParams {
  /** 前段素材列表（文件名数组） */
  frontAssets: string[]
  /** 中段素材列表（文件名数组） */
  midAssets: string[]
  /** 后段素材列表（文件名数组） */
  endAssets: string[]
  /** 当前索引位置（可选，用于继续遍历） */
  currentIndex?: number
}

/** 获取下一个可用组合的返回结果 */
export interface GetNextCombinationResult {
  /** 是否找到可用组合 */
  found: boolean
  /** 前段片段文件名 */
  front?: string
  /** 中段片段文件名 */
  mid?: string
  /** 后段片段文件名 */
  end?: string
  /** 当前索引位置 */
  currentIndex: number
  /** 是否所有组合都已用完 */
  exhausted: boolean
  /** 总组合数 */
  totalCombinations: number
  /** 已使用的组合数 */
  usedCombinations: number
}

/** 获取组合统计信息的返回结果 */
export interface CombinationStatsResult {
  /** 前中组合已使用数量 */
  frontMidCount: number
  /** 中后组合已使用数量 */
  midEndCount: number
  /** 总记录数 */
  totalRecords: number
}

