import fs from 'node:fs'
import os from 'os'
import { spawn } from 'child_process'
import { ExecuteFFmpegResult, RenderVideoParams } from './types'
import { getTempTtsVoiceFilePath } from '../tts'
import path from 'node:path'
import { generateUniqueFileName } from '../lib/tools'

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
const isWindows = process.platform === 'win32'

const ffmpegPath: string = VITE_DEV_SERVER_URL
  ? require('ffmpeg-static')
  : (require('ffmpeg-static') as string).replace('app.asar', 'app.asar.unpacked')

// async function test() {
//   try {
//     const result = await executeFFmpeg(['-version'])
//     console.log(result.stdout)
//   } catch (error) {
//     console.log(error)
//   }
// }
// test()

export async function renderVideo(
  params: RenderVideoParams & {
    onProgress?: (progress: number) => void
    abortSignal?: AbortSignal
  },
): Promise<ExecuteFFmpegResult> {
  try {
    // 解构参数
    const { videoFiles, timeRanges, outputSize, onProgress, abortSignal } = params

    // 检查视频片段是否为空
    if (!videoFiles || videoFiles.length === 0) {
      throw new Error('无法渲染视频：没有提供视频片段（videoFiles 为空）')
    }
    
    if (!timeRanges || timeRanges.length !== videoFiles.length) {
      throw new Error(`无法渲染视频：timeRanges (${timeRanges?.length ?? 0}) 与 videoFiles (${videoFiles.length}) 数量不匹配`)
    }
    
    // 计算视频总时长（从 timeRanges 中计算）
    let calculatedVideoDuration = 0
    for (const [start, end] of timeRanges) {
      calculatedVideoDuration += parseFloat(end) - parseFloat(start)
    }
    
    // 如果传入了 outputDuration，使用传入值；否则使用计算的视频总时长
    const outputDuration = params.outputDuration ?? String(calculatedVideoDuration)

    // 音频默认配置
    const audioFiles = params.audioFiles ?? {}
    
    // 判断是否有语音：null表示明确无语音，undefined表示使用默认路径
    const hasVoice = audioFiles.voice !== null
    
    // 如果有语音且未指定路径，使用默认路径
    if (hasVoice && (audioFiles.voice === undefined || !audioFiles.voice)) {
      audioFiles.voice = getTempTtsVoiceFilePath()
    }

    // 字幕默认配置 - 只在有语音时才设置字幕
    let subtitleFile: string | null = null
    if (hasVoice && params.subtitleFile !== null) {
      subtitleFile =
        params.subtitleFile ??
        path
          .join(
            path.dirname(getTempTtsVoiceFilePath()),
            path.basename(getTempTtsVoiceFilePath(), '.mp3') + '.srt',
          )
          .replace(/\\/g, '/')
    }

    // 输出路径默认配置
    if (!fs.existsSync(path.dirname(params.outputPath))) {
      throw new Error(`输出路径不存在`)
    }
    const outputPath = generateUniqueFileName(params.outputPath)

    // 构建args指令
    const args = []

    // 添加所有视频输入
    videoFiles.forEach((file) => {
      args.push('-i', `${file}`)
    })

    // 添加音频输入
    let audioInputIndex = videoFiles.length
    
    // 语音音轨（仅在有语音时添加）
    if (hasVoice) {
      args.push('-i', `${audioFiles.voice}`)
      audioInputIndex++
    }

    // 背景音乐
    const hasBgm = audioFiles?.bgm
    if (hasBgm) {
      args.push('-i', `${audioFiles.bgm}`)
    }

    // 构建复杂滤镜
    const filters = []
    const videoStreams: string[] = []

    // 处理每个视频片段
    videoFiles.forEach((_, index) => {
      const [start, end] = timeRanges[index]
      const streamLabel = `v${index}`
      videoStreams.push(streamLabel)

      // 使用 trim、setpts、scale、pad 等操作处理视频
      filters.push(
        `[${index}:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS,scale=${outputSize.width}:${outputSize.height}:force_original_aspect_ratio=decrease,pad=${outputSize.width}:${outputSize.height}:(ow-iw)/2:(oh-ih)/2,fps=30,format=yuv420p,setsar=1[${streamLabel}]`,
      )
    })

    // 拼接视频
    filters.push(`[${videoStreams.join('][')}]concat=n=${videoFiles.length}:v=1:a=0[vconcat]`)

    // 重置时间基、帧率、色彩空间
    filters.push(`[vconcat]fps=30,format=yuv420p,setpts=PTS-STARTPTS[vout]`)

    // 在视频拼接后添加字幕（仅在有语音和字幕文件时）
    let finalVideoStream = 'vout'
    if (hasVoice && subtitleFile && fs.existsSync(subtitleFile)) {
      filters.push(`[vout]subtitles=${subtitleFile.replace(/\:/g, '\\\\:')}[with_subs]`)
      finalVideoStream = 'with_subs'
    }

    // 音频处理
    if (hasVoice || hasBgm) {
      let voiceIndex = videoFiles.length
      let bgmIndex = hasVoice ? videoFiles.length + 1 : videoFiles.length

      if (hasVoice) {
        // voice 音量放大
        filters.push(`[${voiceIndex}:a]volume=2[voice]`)
      }

      if (hasBgm) {
        // bgm 音量缩小
        filters.push(`[${bgmIndex}:a]volume=0.5[bgm]`)
      }

      // 混合音频
      if (hasVoice && hasBgm) {
        // 有语音和背景音乐：以语音时长为准
        filters.push(`[voice][bgm]amix=inputs=2:duration=first[aout]`)
      } else if (hasVoice) {
        filters.push(`[voice]acopy[aout]`)
      } else if (hasBgm) {
        // 只有背景音乐（无语音模式）：直接使用 BGM
        // 通过 -t 参数限制输出时长为视频总时长
        filters.push(`[bgm]acopy[aout]`)
      }
    }

    // 设置 filter_complex
    args.push('-filter_complex', `${filters.join(';')}`)

    // 映射输出流
    args.push('-map', `[${finalVideoStream}]`)
    
    // 只有在有音频时才映射音频流
    if (hasVoice || hasBgm) {
      args.push('-map', '[aout]')
    }

    // 编码参数
    args.push(
      '-c:v',
      'libx264',
      '-preset',
      'medium',
      '-crf',
      '23',
      '-r',
      '30',
    )
    
    // 只有在有音频时才添加音频编码参数
    if (hasVoice || hasBgm) {
      args.push('-c:a', 'aac', '-b:a', '128k')
    }
    
    args.push(
      '-fps_mode',
      'cfr',
      '-s',
      `${outputSize.width}x${outputSize.height}`,
      '-progress',
      'pipe:1',
      ...(outputDuration ? ['-t', outputDuration] : []),
      '-stats',
      outputPath,
    )

    // 打印简要信息
    console.log(`[FFmpeg] Rendering video: ${videoFiles.length} clips, duration=${outputDuration}s`)

    // 执行命令
    const result = await executeFFmpeg(args, { onProgress, abortSignal })

    // 移除临时文件
    if (hasVoice && audioFiles.voice && fs.existsSync(audioFiles.voice)) {
      fs.unlinkSync(audioFiles.voice)
    }
    if (subtitleFile && fs.existsSync(subtitleFile)) {
      fs.unlinkSync(subtitleFile)
    }

    // 返回结果
    return result
  } catch (error) {
    throw error
  }
}

export async function executeFFmpeg(
  args: string[],
  options?: {
    cwd?: string
    onProgress?: (progress: number) => void
    abortSignal?: AbortSignal
  },
): Promise<ExecuteFFmpegResult> {
  isWindows && validateExecutables()

  return new Promise((resolve, reject) => {
    const defaultOptions = {
      cwd: process.cwd(),
      env: process.env,
      ...options,
    }

    const child = spawn(ffmpegPath, args, defaultOptions)

    let stdout = ''
    let stderr = ''
    let progress = 0

    child.stdout.on('data', (data) => {
      stdout += data.toString()
      // 处理进度信息
      progress = parseProgress(data.toString()) ?? 0
      options?.onProgress?.(progress >= 100 ? 99 : progress)
    })

    child.stderr.on('data', (data) => {
      stderr += data.toString()
      options?.onProgress?.(progress >= 100 ? 99 : progress)
    })

    child.on('close', (code) => {
      if (code === 0) {
        console.log('[FFmpeg] Render completed successfully')
        options?.onProgress?.(100)
        resolve({ stdout, stderr, code })
      } else {
        reject(new Error(`FFmpeg exited with code ${code}: ${stderr.slice(-500)}`))
      }
    })

    child.on('error', (error) => {
      reject(new Error(`Failed to start FFmpeg: ${error.message}`))
    })

    // 提供取消功能
    if (options?.abortSignal) {
      options.abortSignal.addEventListener('abort', () => {
        child.kill('SIGTERM')
      })
    }
  })
}

function validateExecutables() {
  if (!fs.existsSync(ffmpegPath)) {
    throw new Error(`FFmpeg not found at: ${ffmpegPath}`)
  }

  try {
    fs.accessSync(ffmpegPath, fs.constants.X_OK)
  } catch (error) {
    // Windows 上可能没有 X_OK 权限标志
    if (os.platform() !== 'win32') {
      throw new Error('FFmpeg executables do not have execute permissions')
    }
  }
}

function parseProgress(stderrLine: string) {
  // 解析时间信息：frame=  123 fps= 45 q=25.0 size=    1024kB time=00:00:05.00 bitrate=1677.7kbits/s speed=1.5x
  const timeMatch = stderrLine.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/)
  if (timeMatch) {
    const hours = parseInt(timeMatch[1])
    const minutes = parseInt(timeMatch[2])
    const seconds = parseFloat(timeMatch[3])
    return hours * 3600 + minutes * 60 + seconds
  }
  return null
}
