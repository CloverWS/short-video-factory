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
    const { videoFiles, timeRanges, outputSize, outputDuration, onProgress, abortSignal } = params

    // 音频默认配置
    const audioFiles = params.audioFiles ?? {}
    // 只有在传入了voice时才使用，否则不设置默认值
    // audioFiles.voice = params.audioFiles?.voice ?? getTempTtsVoiceFilePath()

    // 字幕默认配置 - 只有在有voice时才需要字幕
    const subtitleFile =
      params.subtitleFile ??
      (audioFiles.voice
        ? path
            .join(
              path.dirname(getTempTtsVoiceFilePath()),
              path.basename(getTempTtsVoiceFilePath(), '.mp3') + '.srt',
            )
            .replace(/\\/g, '/')
        : undefined)

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
    // 语音音轨（仅在有voice时添加）
    let voiceInputIndex = -1
    if (audioFiles.voice) {
      voiceInputIndex = videoFiles.length
      args.push('-i', `${audioFiles.voice}`)
    }

    // 背景音乐
    let bgmInputIndex = -1
    if (audioFiles?.bgm) {
      bgmInputIndex = audioFiles.voice ? videoFiles.length + 1 : videoFiles.length
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

    // 在视频拼接后添加字幕（仅在有字幕文件时）
    let videoOutputLabel = 'vout'
    if (subtitleFile && fs.existsSync(subtitleFile)) {
      filters.push(`[vout]subtitles=${subtitleFile.replace(/\:/g, '\\\\:')}[with_subs]`)
      videoOutputLabel = 'with_subs'
    }

    // 音频处理：根据是否有voice和bgm来决定如何处理
    let hasAudio = false
    
    if (audioFiles.voice && voiceInputIndex >= 0) {
      filters.push(`[${voiceInputIndex}:a]volume=2[voice]`) // voice 音量放大
      hasAudio = true
    }
    
    if (audioFiles.bgm && bgmInputIndex >= 0) {
      filters.push(`[${bgmInputIndex}:a]volume=0.5[bgm]`) // bgm 音量缩小
      hasAudio = true
    }

    // 混合音频
    if (audioFiles.voice && audioFiles.bgm) {
      filters.push(`[voice][bgm]amix=inputs=2:duration=longest[aout]`)
    } else if (audioFiles.voice) {
      filters.push(`[voice]amix=inputs=1:duration=longest[aout]`)
    } else if (audioFiles.bgm) {
      filters.push(`[bgm]amix=inputs=1:duration=longest[aout]`)
    }

    // 设置 filter_complex
    args.push('-filter_complex', `${filters.join(';')}`)

    // 映射输出流
    args.push('-map', `[${videoOutputLabel}]`)
    if (hasAudio) {
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
    if (hasAudio) {
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

    // 打印命令
    // console.log('传入参数:', params)
    // console.log('执行命令:', args.join(' '))

    // 执行命令
    const result = await executeFFmpeg(args, { onProgress, abortSignal })

    // 移除临时文件
    if (audioFiles.voice && fs.existsSync(audioFiles.voice)) {
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
      // 实时输出进度信息
      options?.onProgress?.(progress >= 100 ? 99 : progress)
    })

    child.on('close', (code) => {
      if (code === 0) {
        options?.onProgress?.(100)
        resolve({ stdout, stderr, code })
      } else {
        reject(new Error(`FFmpeg exited with code ${code}: ${stderr}`))
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
