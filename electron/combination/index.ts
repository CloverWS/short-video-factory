/**
 * 视频组合管理模块
 * 用于管理前中后三段视频的组合，避免连续两段重复
 * 
 * 去重规则：
 * - 如果 (front, mid) 相同（前两段重复），判定为重复
 * - 如果 (mid, end) 相同（后两段重复），判定为重复
 * - 非连续两段相同（如 front 和 end 相同）不判定为重复
 */

import path from 'node:path'
import fs from 'node:fs'
import { app } from 'electron'
import {
  CheckCombinationParams,
  CheckCombinationResult,
  RecordCombinationParams,
  GetNextCombinationParams,
  GetNextCombinationResult,
  CombinationStatsResult,
} from './types'

// 数据文件路径
const getDataFilePath = () => path.join(app.getPath('userData'), 'video-combinations.json')

// 内存中的数据缓存（使用 Set 实现 O(1) 查找）
let frontMidSet: Set<string> = new Set()
let midEndSet: Set<string> = new Set()
let currentIterationIndex = 0

// 生成组合的唯一键
const makeCombinationKey = (first: string, second: string): string => {
  return `${first}|||${second}`
}

/**
 * 初始化组合管理模块，从文件加载已有数据
 */
export const initCombinationManager = async (): Promise<void> => {
  const filePath = getDataFilePath()
  
  try {
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
      frontMidSet = new Set(data.frontMid || [])
      midEndSet = new Set(data.midEnd || [])
      currentIterationIndex = data.currentIndex || 0
      console.log(`[CombinationManager] Loaded data: front_mid=${frontMidSet.size}, mid_end=${midEndSet.size}, index=${currentIterationIndex}`)
    } else {
      console.log('[CombinationManager] Data file not found, initializing with empty data')
    }
  } catch (error) {
    console.error('[CombinationManager] Failed to load data:', error)
    frontMidSet = new Set()
    midEndSet = new Set()
    currentIterationIndex = 0
  }
}

/**
 * 保存数据到文件
 */
const saveData = async (): Promise<void> => {
  const filePath = getDataFilePath()
  const data = {
    frontMid: Array.from(frontMidSet),
    midEnd: Array.from(midEndSet),
    currentIndex: currentIterationIndex,
    updatedAt: new Date().toISOString(),
  }
  
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
  } catch (error) {
    console.error('[CombinationManager] Failed to save data:', error)
    throw error
  }
}

/**
 * 检查组合是否可用（不违反去重规则）
 */
export const checkCombination = async (params: CheckCombinationParams): Promise<CheckCombinationResult> => {
  const { front, mid, end } = params
  
  const frontMidKey = makeCombinationKey(front, mid)
  const midEndKey = makeCombinationKey(mid, end)
  
  // 检查前中组合是否已存在
  if (frontMidSet.has(frontMidKey)) {
    return {
      available: false,
      reason: 'front_mid_exists',
    }
  }
  
  // 检查中后组合是否已存在
  if (midEndSet.has(midEndKey)) {
    return {
      available: false,
      reason: 'mid_end_exists',
    }
  }
  
  return { available: true }
}

/**
 * 记录已使用的组合
 */
export const recordCombination = async (params: RecordCombinationParams): Promise<void> => {
  const { front, mid, end } = params
  
  const frontMidKey = makeCombinationKey(front, mid)
  const midEndKey = makeCombinationKey(mid, end)
  
  frontMidSet.add(frontMidKey)
  midEndSet.add(midEndKey)
  
  await saveData()
  console.log(`[CombinationManager] Recorded combination: front=${front}, mid=${mid}, end=${end}`)
}

/**
 * 获取下一个可用的组合（按顺序遍历）
 */
export const getNextAvailableCombination = async (params: GetNextCombinationParams): Promise<GetNextCombinationResult> => {
  const { frontAssets, midAssets, endAssets, currentIndex } = params
  
  const totalCombinations = frontAssets.length * midAssets.length * endAssets.length
  
  if (totalCombinations === 0) {
    return {
      found: false,
      currentIndex: 0,
      exhausted: true,
      totalCombinations: 0,
      usedCombinations: 0,
    }
  }
  
  // 使用传入的索引或从保存的位置继续
  let startIndex = currentIndex !== undefined ? currentIndex : currentIterationIndex
  let checkedCount = 0
  
  // 遍历所有组合，从当前位置开始
  while (checkedCount < totalCombinations) {
    const currentIdx = (startIndex + checkedCount) % totalCombinations
    
    // 将线性索引转换为三维坐标
    const frontIdx = Math.floor(currentIdx / (midAssets.length * endAssets.length))
    const midIdx = Math.floor((currentIdx % (midAssets.length * endAssets.length)) / endAssets.length)
    const endIdx = currentIdx % endAssets.length
    
    const front = frontAssets[frontIdx]
    const mid = midAssets[midIdx]
    const end = endAssets[endIdx]
    
    // 检查这个组合是否可用
    const checkResult = await checkCombination({ front, mid, end })
    
    if (checkResult.available) {
      // 更新当前索引（下次从下一个位置开始）
      currentIterationIndex = (currentIdx + 1) % totalCombinations
      await saveData()
      
      return {
        found: true,
        front,
        mid,
        end,
        currentIndex: currentIdx,
        exhausted: false,
        totalCombinations,
        usedCombinations: frontMidSet.size, // 近似值
      }
    }
    
    checkedCount++
  }
  
  // 所有组合都已被使用
  return {
    found: false,
    currentIndex: startIndex,
    exhausted: true,
    totalCombinations,
    usedCombinations: frontMidSet.size,
  }
}

/**
 * 获取组合统计信息
 */
export const getCombinationStats = async (): Promise<CombinationStatsResult> => {
  return {
    frontMidCount: frontMidSet.size,
    midEndCount: midEndSet.size,
    totalRecords: frontMidSet.size + midEndSet.size,
  }
}

/**
 * 清除所有组合记录
 */
export const clearAllCombinations = async (): Promise<void> => {
  frontMidSet.clear()
  midEndSet.clear()
  currentIterationIndex = 0
  
  await saveData()
  console.log('[CombinationManager] All combination records cleared')
}

/**
 * 重置遍历索引（从头开始遍历）
 */
export const resetIterationIndex = async (): Promise<void> => {
  currentIterationIndex = 0
  await saveData()
  console.log('[CombinationManager] Iteration index reset')
}

/**
 * 获取当前遍历索引
 */
export const getCurrentIterationIndex = async (): Promise<number> => {
  return currentIterationIndex
}

