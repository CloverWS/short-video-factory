<template>
  <div class="w-full h-full">
    <v-form class="w-full h-full" :disabled="disabled">
      <v-sheet class="h-full p-2 flex flex-col" border rounded>
        <!-- First Segment Folder -->
        <div class="flex gap-2 mb-2">
          <v-text-field
            v-model="appStore.videoAssetsFolderFirst"
            :label="t('videoManage.assetsFirstFolderLabel')"
            density="compact"
            hide-details
            readonly
          >
          </v-text-field>
          <v-btn
            class="mt-[2px]"
            prepend-icon="mdi-folder-open"
            :disabled="disabled"
            @click="handleSelectFolder('first')"
          >
            {{ t('common.select') }}
          </v-btn>
        </div>

        <!-- Second Segment Folder -->
        <div class="flex gap-2 mb-2">
          <v-text-field
            v-model="appStore.videoAssetsFolderSecond"
            :label="t('videoManage.assetsSecondFolderLabel')"
            density="compact"
            hide-details
            readonly
          >
          </v-text-field>
          <v-btn
            class="mt-[2px]"
            prepend-icon="mdi-folder-open"
            :disabled="disabled"
            @click="handleSelectFolder('second')"
          >
            {{ t('common.select') }}
          </v-btn>
        </div>

        <!-- Third Segment Folder -->
        <div class="flex gap-2 mb-2">
          <v-text-field
            v-model="appStore.videoAssetsFolderThird"
            :label="t('videoManage.assetsThirdFolderLabel')"
            density="compact"
            hide-details
            readonly
          >
          </v-text-field>
          <v-btn
            class="mt-[2px]"
            prepend-icon="mdi-folder-open"
            :disabled="disabled"
            @click="handleSelectFolder('third')"
          >
            {{ t('common.select') }}
          </v-btn>
        </div>

        <div class="flex-1 h-0 w-full border">
          <div
            v-if="allVideoAssets.length"
            class="w-full max-h-full overflow-y-auto grid grid-cols-3 gap-2 p-2"
          >
            <div
              class="w-full h-full max-h-[200px]"
              v-for="(item, index) in allVideoAssets"
              :key="index"
            >
              <VideoAutoPreview
                :asset="item"
                @loaded="
                  (info) => {
                    handleVideoLoaded(index, info)
                  }
                "
              />
            </div>
          </div>
          <v-empty-state
            v-else
            :headline="t('empty.noContent')"
            :text="t('empty.hintSelectFolder')"
          ></v-empty-state>
        </div>

        <div class="my-2">
          <v-btn
            block
            prepend-icon="mdi-refresh"
            :disabled="disabled || (!appStore.videoAssetsFolderFirst && !appStore.videoAssetsFolderSecond && !appStore.videoAssetsFolderThird)"
            :loading="refreshAssetsLoading"
            @click="refreshAssets"
          >
            {{ t('actions.refreshAssets') }}
          </v-btn>
        </div>
      </v-sheet>
    </v-form>
  </div>
</template>

<script lang="ts" setup>
import { ref, toRaw } from 'vue'
import { useTranslation } from 'i18next-vue'
import { useAppStore } from '@/store'
import { useToast } from 'vue-toastification'
import { ListFilesFromFolderRecord } from '~/electron/types'
import { RenderVideoParams } from '~/electron/ffmpeg/types'
import VideoAutoPreview, { VideoInfo } from '@/components/VideoAutoPreview.vue'
import random from 'random'

const toast = useToast()
const appStore = useAppStore()
const { t } = useTranslation()

defineProps<{
  disabled?: boolean
}>()

// 选择文件夹
const handleSelectFolder = async (segment: 'first' | 'second' | 'third') => {
  let defaultPath = ''
  if (segment === 'first') {
    defaultPath = appStore.videoAssetsFolderFirst
  } else if (segment === 'second') {
    defaultPath = appStore.videoAssetsFolderSecond
  } else {
    defaultPath = appStore.videoAssetsFolderThird
  }

  const folderPath = await window.electron.selectFolder({
    title: t('dialogs.selectAssetsFolderTitle'),
    defaultPath,
  })
  console.log(`用户选择分镜素材文件夹（${segment}），绝对路径：`, folderPath)
  if (folderPath) {
    if (segment === 'first') {
      appStore.videoAssetsFolderFirst = folderPath
    } else if (segment === 'second') {
      appStore.videoAssetsFolderSecond = folderPath
    } else {
      appStore.videoAssetsFolderThird = folderPath
    }
    refreshAssets()
  }
}

// 刷新素材库
const videoAssetsFirst = ref<ListFilesFromFolderRecord[]>([])
const videoAssetsSecond = ref<ListFilesFromFolderRecord[]>([])
const videoAssetsThird = ref<ListFilesFromFolderRecord[]>([])
const allVideoAssets = ref<ListFilesFromFolderRecord[]>([])

// 获取视频分镜随机素材片段 - 先声明这些变量
const videoInfoListFirst = ref<VideoInfo[]>([])
const videoInfoListSecond = ref<VideoInfo[]>([])
const videoInfoListThird = ref<VideoInfo[]>([])

const refreshAssetsLoading = ref(false)
const refreshAssets = async () => {
  refreshAssetsLoading.value = true
  try {
    // 清空所有素材
    videoAssetsFirst.value = []
    videoAssetsSecond.value = []
    videoAssetsThird.value = []
    allVideoAssets.value = []
    videoInfoListFirst.value = []
    videoInfoListSecond.value = []
    videoInfoListThird.value = []

    // 读取第一段素材
    if (appStore.videoAssetsFolderFirst) {
      const assetsFirst = await window.electron.listFilesFromFolder({
        folderPath: appStore.videoAssetsFolderFirst,
      })
      videoAssetsFirst.value = assetsFirst.filter((asset) => asset.name.endsWith('.mp4'))
    }

    // 读取第二段素材
    if (appStore.videoAssetsFolderSecond) {
      const assetsSecond = await window.electron.listFilesFromFolder({
        folderPath: appStore.videoAssetsFolderSecond,
      })
      videoAssetsSecond.value = assetsSecond.filter((asset) => asset.name.endsWith('.mp4'))
    }

    // 读取第三段素材
    if (appStore.videoAssetsFolderThird) {
      const assetsThird = await window.electron.listFilesFromFolder({
        folderPath: appStore.videoAssetsFolderThird,
      })
      videoAssetsThird.value = assetsThird.filter((asset) => asset.name.endsWith('.mp4'))
    }

    // 合并所有素材用于显示
    allVideoAssets.value = [
      ...videoAssetsFirst.value,
      ...videoAssetsSecond.value,
      ...videoAssetsThird.value,
    ]

    if (
      !videoAssetsFirst.value.length &&
      !videoAssetsSecond.value.length &&
      !videoAssetsThird.value.length
    ) {
      toast.warning(t('videoManage.noMp4InFolder'))
    } else {
      toast.success(t('videoManage.readSuccess'))
    }
  } catch (error) {
    console.log(error)
    toast.error(t('videoManage.readFailed'))
  } finally {
    refreshAssetsLoading.value = false
  }
}
refreshAssets()

// 处理视频加载完成事件，将视频信息存入对应的列表
const handleVideoLoaded = (index: number, info: VideoInfo) => {
  const firstCount = videoAssetsFirst.value.length
  const secondCount = videoAssetsSecond.value.length

  if (index < firstCount) {
    videoInfoListFirst.value[index] = info
  } else if (index < firstCount + secondCount) {
    videoInfoListSecond.value[index - firstCount] = info
  } else {
    videoInfoListThird.value[index - firstCount - secondCount] = info
  }
}

const getVideoSegments = (options: { duration: number }) => {
  // 搜集随机素材片段
  const segments: Pick<RenderVideoParams, 'videoFiles' | 'timeRanges'> = {
    videoFiles: [],
    timeRanges: [],
  }
  const minSegmentDuration = 2
  const maxSegmentDuration = 15
  const trunc3 = (n: number) => ((n * 1e3) << 0) / 1e3

  // 将总时长分为三段：开头、中间、结尾
  // 开头和结尾各占 20%，中间占 60%
  const firstSegmentDuration = options.duration * 0.2
  const secondSegmentDuration = options.duration * 0.6
  const thirdSegmentDuration = options.duration * 0.2

  // 辅助函数：从指定素材池中选择片段
  const selectSegmentsFromPool = (
    targetDuration: number,
    assetPool: ListFilesFromFolderRecord[],
    infoPool: VideoInfo[],
    allowRepeat = false, // 是否允许重复使用素材
  ) => {
    if (assetPool.length === 0 || targetDuration === 0) {
      return { videoFiles: [], timeRanges: [] }
    }

    // 如果不允许重复，检查素材池是否有足够时长
    if (!allowRepeat && infoPool.reduce((pre, cur) => pre + cur.duration, 0) < targetDuration) {
      throw new Error(t('errors.assetsDurationInsufficient'))
    }

    const result: Pick<RenderVideoParams, 'videoFiles' | 'timeRanges'> = {
      videoFiles: [],
      timeRanges: [],
    }

    let currentTotalDuration = 0
    let tempAssets = structuredClone(toRaw(assetPool))

    while (currentTotalDuration < targetDuration) {
      // 如果素材库中没有剩余素材，时长还不够，重新来一轮
      if (tempAssets.length === 0) {
        tempAssets = structuredClone(toRaw(assetPool))
        continue
      }

      // 获取一个随机素材以及相关信息
      const randomAsset = random.choice(tempAssets)!
      const randomAssetIndex = assetPool.findIndex((asset) => asset.path === randomAsset.path)
      const randomAssetInfo = infoPool[randomAssetIndex]

      // 删除已选素材
      const tempIndex = tempAssets.findIndex((asset) => asset.path === randomAsset.path)
      tempAssets.splice(tempIndex, 1)

      // 如果素材时长小于最小片段时长，直接添加
      if (randomAssetInfo.duration < minSegmentDuration) {
        result.videoFiles.push(randomAsset.path)
        result.timeRanges.push([String(0), String(randomAssetInfo.duration)])
        currentTotalDuration = trunc3(currentTotalDuration + randomAssetInfo.duration)
        continue
      }

      // 如果素材时长大于最小片段时长，随机一个片段
      let randomSegmentDuration = random.float(
        minSegmentDuration,
        Math.min(maxSegmentDuration, randomAssetInfo.duration),
      )

      // 计算剩余需要的时长
      const remainingDuration = targetDuration - currentTotalDuration

      // 处理最后一个片段的情况
      if (remainingDuration <= randomSegmentDuration) {
        // 如果剩余时长小于最小片段时长，则使用整个素材或剩余时长（取较小者）
        randomSegmentDuration = Math.min(remainingDuration, randomAssetInfo.duration)
      } else if (remainingDuration < minSegmentDuration + randomSegmentDuration) {
        // 如果添加这个片段后，剩余时长不足最小片段时长，则调整当前片段时长
        randomSegmentDuration = Math.min(
          remainingDuration,
          randomAssetInfo.duration,
          maxSegmentDuration,
        )
      }

      // 确保片段时长不为0且不超过素材时长
      randomSegmentDuration = Math.max(0.1, Math.min(randomSegmentDuration, randomAssetInfo.duration))

      let randomSegmentStart = random.float(0, Math.max(0, randomAssetInfo.duration - randomSegmentDuration))

      result.videoFiles.push(randomAsset.path)
      result.timeRanges.push([
        String(trunc3(randomSegmentStart)),
        String(trunc3(randomSegmentStart + randomSegmentDuration)),
      ])
      currentTotalDuration = trunc3(currentTotalDuration + randomSegmentDuration)

      console.table([
        {
          素材名称: randomAsset.name,
          素材时长: randomAssetInfo.duration,
          片段开始: trunc3(randomSegmentStart),
          片段时长: trunc3(randomSegmentDuration),
        },
      ])
    }

    return result
  }

  // 从第一段素材池选择
  if (videoAssetsFirst.value.length > 0) {
    const firstSegments = selectSegmentsFromPool(
      firstSegmentDuration,
      videoAssetsFirst.value,
      videoInfoListFirst.value,
    )
    segments.videoFiles.push(...firstSegments.videoFiles)
    segments.timeRanges.push(...firstSegments.timeRanges)
  }

  // 从第二段素材池选择
  if (videoAssetsSecond.value.length > 0) {
    const secondSegments = selectSegmentsFromPool(
      secondSegmentDuration,
      videoAssetsSecond.value,
      videoInfoListSecond.value,
    )
    segments.videoFiles.push(...secondSegments.videoFiles)
    segments.timeRanges.push(...secondSegments.timeRanges)
  }

  // 从第三段素材池选择（允许重复使用素材以填满时长）
  if (videoAssetsThird.value.length > 0) {
    const thirdSegments = selectSegmentsFromPool(
      thirdSegmentDuration,
      videoAssetsThird.value,
      videoInfoListThird.value,
      true, // 允许重复使用第三段素材
    )
    segments.videoFiles.push(...thirdSegments.videoFiles)
    segments.timeRanges.push(...thirdSegments.timeRanges)
  }

  console.log('随机素材片段汇总:', segments)

  return segments
}

// 获取视频片段（无时长限制版本 - 用于无文案模式）
// 改为按顺序遍历所有组合，并应用去重规则
const getVideoSegmentsWithoutDuration = async () => {
  const segments: Pick<RenderVideoParams, 'videoFiles' | 'timeRanges'> = {
    videoFiles: [],
    timeRanges: [],
  }

  // 检查三个素材池是否都有素材
  if (
    videoAssetsFirst.value.length === 0 ||
    videoAssetsSecond.value.length === 0 ||
    videoAssetsThird.value.length === 0
  ) {
    console.warn('无时长限制模式 - 至少有一个素材池为空，无法生成组合')
    return segments
  }

  // 获取文件名列表（用于组合管理）
  const frontAssets = videoAssetsFirst.value.map((asset) => asset.name)
  const midAssets = videoAssetsSecond.value.map((asset) => asset.name)
  const endAssets = videoAssetsThird.value.map((asset) => asset.name)

  // 获取下一个可用的组合（按顺序遍历，自动跳过重复的组合）
  const result = await window.combination.getNext({
    frontAssets,
    midAssets,
    endAssets,
  })

  console.log('组合查询结果:', result)

  if (!result.found) {
    if (result.exhausted) {
      toast.warning(t('videoManage.allCombinationsUsed'))
      console.warn('无时长限制模式 - 所有组合都已使用完毕')
    }
    return segments
  }

  // 根据文件名找到对应的素材信息
  const frontAsset = videoAssetsFirst.value.find((asset) => asset.name === result.front)
  const midAsset = videoAssetsSecond.value.find((asset) => asset.name === result.mid)
  const endAsset = videoAssetsThird.value.find((asset) => asset.name === result.end)

  if (!frontAsset || !midAsset || !endAsset) {
    console.error('无时长限制模式 - 无法找到对应的素材文件')
    return segments
  }

  // 获取视频时长信息
  const frontIndex = videoAssetsFirst.value.indexOf(frontAsset)
  const midIndex = videoAssetsSecond.value.indexOf(midAsset)
  const endIndex = videoAssetsThird.value.indexOf(endAsset)

  const frontInfo = videoInfoListFirst.value[frontIndex]
  const midInfo = videoInfoListSecond.value[midIndex]
  const endInfo = videoInfoListThird.value[endIndex]

  // 添加三段视频
  segments.videoFiles.push(frontAsset.path)
  segments.timeRanges.push([String(0), String(frontInfo?.duration || 0)])

  segments.videoFiles.push(midAsset.path)
  segments.timeRanges.push([String(0), String(midInfo?.duration || 0)])

  segments.videoFiles.push(endAsset.path)
  segments.timeRanges.push([String(0), String(endInfo?.duration || 0)])

  // 记录这个组合（用于后续去重）
  await window.combination.record({
    front: result.front!,
    mid: result.mid!,
    end: result.end!,
  })

  console.log('无时长限制模式 - 按顺序选择素材片段汇总:', {
    组合索引: result.currentIndex,
    总组合数: result.totalCombinations,
    已使用组合数: result.usedCombinations,
    前段: result.front,
    中段: result.mid,
    后段: result.end,
    segments,
  })

  return segments
}

// 获取组合统计信息
const getCombinationStats = async () => {
  return await window.combination.getStats()
}

// 清除所有组合记录
const clearCombinationRecords = async () => {
  await window.combination.clear()
  toast.success(t('videoManage.combinationRecordsCleared'))
}

// 重置遍历索引
const resetCombinationIndex = async () => {
  await window.combination.resetIndex()
  toast.success(t('videoManage.combinationIndexReset'))
}

defineExpose({
  getVideoSegments,
  getVideoSegmentsWithoutDuration,
  getCombinationStats,
  clearCombinationRecords,
  resetCombinationIndex,
})
</script>

<style lang="scss" scoped>
//
</style>
