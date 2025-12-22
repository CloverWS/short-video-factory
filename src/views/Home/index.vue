<template>
  <div class="w-full h-full flex flex-col">
    <div class="w-full h-[40px] window-drag relative border-b">
      <div class="window-control-bar-no-drag-mask"></div>
    </div>

    <div class="w-full h-0 flex-1 flex box-border gap-2 py-2 px-3">
      <div class="w-1/3 h-full">
        <TextGenerate
          ref="TextGenerateInstance"
          :disabled="appStore.renderStatus === RenderStatus.GenerateText"
        />
      </div>
      <div class="w-1/3 h-full">
        <VideoManage
          ref="VideoManageInstance"
          :disabled="appStore.renderStatus === RenderStatus.SegmentVideo"
        />
      </div>
      <div class="w-1/3 h-full flex flex-col gap-3">
        <TtsControl
          ref="TtsControlInstance"
          :disabled="appStore.renderStatus === RenderStatus.SynthesizedSpeech"
        />
        <VideoRender @render-video="handleRenderVideo" @cancel-render="handleCancelRender" />
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import TextGenerate from './components/TextGenerate.vue'
import VideoManage from './components/VideoManage.vue'
import TtsControl from './components/TtsControl.vue'
import VideoRender from './components/VideoRender.vue'

import { ref } from 'vue'
import { RenderStatus, useAppStore } from '@/store'
import { useTranslation } from 'i18next-vue'
import { useToast } from 'vue-toastification'
import { ListFilesFromFolderRecord } from '~/electron/types'
import random from 'random'

const toast = useToast()
const appStore = useAppStore()
const { t } = useTranslation()

// 渲染合成视频
const TextGenerateInstance = ref<InstanceType<typeof TextGenerate> | null>()
const VideoManageInstance = ref<InstanceType<typeof VideoManage> | null>()
const TtsControlInstance = ref<InstanceType<typeof TtsControl> | null>()
const handleRenderVideo = async () => {
  if (!appStore.renderConfig.outputFileName) {
    toast.warning(t('errors.outputFileNameRequired'))
    return
  }
  if (!appStore.renderConfig.outputPath) {
    toast.warning(t('errors.outputPathRequired'))
    return
  }
  if (!appStore.renderConfig.outputSize?.width || !appStore.renderConfig.outputSize?.height) {
    toast.warning(t('errors.outputSizeRequired'))
    return
  }

  let randomBgm: ListFilesFromFolderRecord | undefined = undefined
  if (appStore.renderConfig.bgmPath) {
    try {
      const bgmList = (
        await window.electron.listFilesFromFolder({
          folderPath: appStore.renderConfig.bgmPath.replace(/\\/g, '/'),
        })
      ).filter((asset) => asset.name.endsWith('.mp3'))
      if (bgmList.length > 0) {
        randomBgm = random.choice(bgmList)
      }
    } catch (error) {
      console.log('获取背景音乐列表失败', error)
      toast.error(t('errors.bgmListFailed'))
    }
  }

  try {
    // 获取文案（可选）
    appStore.updateRenderStatus(RenderStatus.GenerateText)
    const text = TextGenerateInstance.value?.getCurrentOutputText() || ''
    
    // 如果有文案内容，尝试生成（可能会失败，但不会抛出错误）
    if (!text && appStore.prompt) {
      try {
        await TextGenerateInstance.value?.handleGenerate({ noToast: true })
      } catch (error) {
        // 文案生成失败时继续执行，使用空文案
        console.log('文案生成失败，将使用空文案继续', error)
      }
    }

    // 判断是否有文案：有文案则生成TTS并根据TTS时长裁剪视频，无文案则直接拼接视频
    const hasText = text && text.trim().length > 0

    let ttsResult: { duration: number | undefined; path: string } | undefined
    let videoSegments: any

    if (hasText) {
      // 模式1：有文案 - 生成TTS语音，根据语音时长选择视频片段
      // @ts-ignore
      if (appStore.renderStatus !== RenderStatus.GenerateText) {
        return
      }
      appStore.updateRenderStatus(RenderStatus.SynthesizedSpeech)
      console.log('开始TTS语音合成，文本长度:', text.length)
      try {
        ttsResult = await TtsControlInstance.value?.synthesizedSpeechToFile({
          text,
          withCaption: true,
        })
        console.log('TTS合成完成，结果:', ttsResult)
      } catch (error) {
        console.error('TTS合成失败:', error)
        throw error
      }
      
      if (ttsResult?.duration === undefined) {
        throw new Error(t('errors.ttsFailedCorrupt'))
      }
      if (ttsResult?.duration === 0) {
        throw new Error(t('errors.ttsZeroDuration'))
      }

      // 获取视频片段（根据TTS时长）
      // @ts-ignore
      if (appStore.renderStatus !== RenderStatus.SynthesizedSpeech) {
        return
      }
      appStore.updateRenderStatus(RenderStatus.SegmentVideo)
      videoSegments = VideoManageInstance.value?.getVideoSegments({
        duration: ttsResult.duration,
      })!
    } else {
      // 模式2：无文案 - 直接拼接视频，不限制时长
      // 使用按顺序遍历的方式获取视频组合，自动应用去重规则
      appStore.updateRenderStatus(RenderStatus.SegmentVideo)
      videoSegments = await VideoManageInstance.value?.getVideoSegmentsWithoutDuration()!
    }

    await new Promise((resolve) => setTimeout(resolve, random.integer(1000, 3000)))

    // 合成视频
    // @ts-ignore
    if (appStore.renderStatus !== RenderStatus.SegmentVideo) {
      return
    }
    appStore.updateRenderStatus(RenderStatus.Rendering)

    // 构建渲染参数
    const renderParams: any = {
      ...videoSegments,
      audioFiles: hasText
        ? {
            // 有文案时包含语音和背景音乐（voice使用默认路径）
            voice: undefined, // 使用默认路径getTempTtsVoiceFilePath()
            bgm: randomBgm?.path,
          }
        : {
            // 无文案时只有背景音乐
            voice: null, // 明确设置为null表示无语音
            bgm: randomBgm?.path,
          },
      outputSize: {
        width: appStore.renderConfig.outputSize.width,
        height: appStore.renderConfig.outputSize.height,
      },
      outputPath:
        appStore.renderConfig.outputPath.replace(/\\/g, '/') +
        '/' +
        appStore.renderConfig.outputFileName +
        appStore.renderConfig.outputFileExt,
    }

    // 有TTS时设置输出时长和字幕文件（使用默认路径）
    if (hasText && ttsResult) {
      renderParams.outputDuration = String(ttsResult.duration)
      // subtitleFile 使用默认路径，不需要特别设置
      renderParams.subtitleFile = undefined
    } else {
      // 无TTS时不设置字幕文件
      renderParams.subtitleFile = null
    }

    await window.electron.renderVideo(renderParams)

    toast.success(t('success.renderSuccess'))
    appStore.updateRenderStatus(RenderStatus.Completed)

    if (appStore.autoBatch) {
      toast.info(t('info.batchNext'))
      TextGenerateInstance.value?.clearOutputText()
      handleRenderVideo()
    }
  } catch (error) {
    console.error('视频合成失败:', error)
    if (appStore.renderStatus === RenderStatus.None) return

    // @ts-ignore
    const errorMessage = error?.message || error?.error?.message
    toast.error(`${t('errors.renderFailedPrefix')}${errorMessage ? '\n' + errorMessage : ''}`)
    appStore.updateRenderStatus(RenderStatus.Failed)
  }
}
const handleCancelRender = () => {
  console.log('视频合成终止')
  switch (appStore.renderStatus) {
    case RenderStatus.GenerateText:
      TextGenerateInstance.value?.handleStopGenerate()
      break

    case RenderStatus.SynthesizedSpeech:
      break

    case RenderStatus.SegmentVideo:
      break

    case RenderStatus.Rendering:
      window.ipcRenderer.send('cancel-render-video')
      break

    default:
      break
  }
  appStore.updateRenderStatus(RenderStatus.None)
  toast.info(t('info.renderCanceled'))
}
</script>

<style lang="scss" scoped>
//
</style>
