/**
 * 코인이지 YouTube Shorts 영상 생성 모듈
  * Edge TTS (한국어 음성) + FFmpeg (영상 합성)
   * 9:16 세로 포맷, 30~45초 쇼츠 생성
    */

import { exec } from 'child_process';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ============================================================
// Edge TTS로 한국어 음성 생성
// ============================================================
async function generateTTS(text, outputPath) {
  console.log('[TTS] Edge TTS 음성 생성 중...');

  // 특수문자 이스케이프 (셸 명령 안전하게)
    const safeText = text
  .replace(/"/g, '\\"')
  .replace(/\$/g, '\\$')
  .replace(/`/g, '\\`');

  const cmd = `edge-tts --voice "ko-KR-SunHiNeural" --text "${safeText}" --write-media "${outputPath}"`;

  try {
    await execAsync(cmd, { timeout: 30000 });
    console.log(`[TTS] 음성 파일 생성 완료: ${outputPath}`);
        return true;
  } catch (err) {
    console.error(`[TTS 에러] ${err.message}`);
        return false;
  }
}

  // ============================================================
  // TTS 음성 길이 측정
  // ============================================================
  async function getAudioDuration(audioPath) {
    try {
      const { stdout } = await execAsync(
        `ffprobe -v error -show_entries format=duration -of csv=p=0 "${audioPath}"`
      );
      return parseFloat(stdout.trim());
    } catch {
          return 30; // 기본 30초
    }
  }

    // ============================================================
    // 자막 파일 생성 (ASS 포맷 - 더 나은 스타일링)
    // ============================================================
    function generateSubtitleASS(lines, totalDuration) {
        const timePerLine = totalDuration / lines.length;

        let events = '';
      lines.forEach((line, i) => {
        const start = formatASSTime(i * timePerLine);
        const end = formatASSTime((i + 1) * timePerLine);
            // 한 줄이 너무 길면 줄바꿈
        const wrappedLine = line.length > 15 ? line.replace(/(.{15})/g, '$1\\N') : line;
        events += `Dialogue: 0,${start},${end},Main,,0,0,0,,${wrappedLine}\n`;
      });

      return `[Script Info]
      Title: CoinEasy Shorts
      ScriptType: v4.00+
      PlayResX: 1080
      PlayResY: 1920

      [V4+ Styles]
      Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
      Style: Main,Arial,72,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,4,2,2,40,40,120,1
      Style: Title,Arial,88,&H0000D4FF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,4,2,8,40,40,60,1

      [Events]
      Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
      ${events}`;
    }

      function formatASSTime(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        const cs = Math.floor((seconds % 1) * 100);
        return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
      }

        // ============================================================
        // FFmpeg로 영상 생성
        // ============================================================
        async function generateVideo(audioPath, subtitlePath, outputPath, duration) {
          console.log('[FFmpeg] 영상 합성 중...');

          // 9:16 세로 (1080x1920), 어두운 그라데이션 배경 + 자막
            const cmd = `ffmpeg -y \
          -f lavfi -i "color=c=0x0a0a2e:s=1080x1920:d=${duration},format=yuv420p" \
          -i "${audioPath}" \
              -vf "\
                    drawbox=x=0:y=0:w=1080:h=640:color=0x0a0a2e@1:t=fill,\
                          drawbox=x=0:y=640:w=1080:h=640:color=0x1a1a4e@1:t=fill,\
                                drawbox=x=0:y=1280:w=1080:h=640:color=0x0a0a2e@1:t=fill,\
                                      drawtext=text='COINEASY':fontsize=52:fontcolor=0xFFD700:x=(w-text_w)/2:y=80:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf,\
                                            drawtext=text='코인이지 데일리 브리핑':fontsize=36:fontcolor=0xCCCCCC:x=(w-text_w)/2:y=150:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf,\
                                                  drawbox=x=100:y=200:w=880:h=4:color=0xFFD700@0.8:t=fill,\
                                                        ass=${subtitlePath}\
                                                            " \
              -c:v libx264 -preset fast -crf 23 \
              -c:a aac -b:a 128k \
              -shortest \
              -movflags +faststart \
          "${outputPath}"`;

          try {
            await execAsync(cmd, { timeout: 120000 });
            console.log(`[FFmpeg] 영상 생성 완료: ${outputPath}`);
                return true;
          } catch (err) {
            console.error(`[FFmpeg 에러] ${err.message}`);
                // 폰트가 없으면 폰트 없이 재시도
            console.log('[FFmpeg] 폰트 없이 재시도...');
                const fallbackCmd = `ffmpeg -y \
            -f lavfi -i "color=c=0x0a0a2e:s=1080x1920:d=${duration},format=yuv420p" \
            -i "${audioPath}" \
            -vf "ass=${subtitlePath}" \
                  -c:v libx264 -preset fast -crf 23 \
                  -c:a aac -b:a 128k \
                  -shortest \
                  -movflags +faststart \
            "${outputPath}"`;

            try {
              await execAsync(fallbackCmd, { timeout: 120000 });
              console.log(`[FFmpeg] 폴백 영상 생성 완료: ${outputPath}`);
                    return true;
            } catch (err2) {
              console.error(`[FFmpeg 폴백 에러] ${err2.message}`);
                    return false;
            }
          }
        }

          // ============================================================
          // 메인: 쇼츠 영상 생성 파이프라인
          // ============================================================
          export async function createShortsVideo(script) {
            console.log('[쇼츠 생성] YouTube Shorts 영상 생성 시작');

              const tmpDir = '/tmp/shorts';
            if (!existsSync(tmpDir)) await mkdir(tmpDir, { recursive: true });

            const dateStr = new Date().toISOString().split('T')[0];
            const audioPath = `${tmpDir}/tts_${dateStr}.mp3`;
            const subtitlePath = `${tmpDir}/sub_${dateStr}.ass`;
            const outputPath = `${tmpDir}/shorts_${dateStr}.mp4`;

            try {
                  // 1. TTS 음성 생성
              const ttsOk = await generateTTS(script.narration, audioPath);
              if (!ttsOk) {
                console.error('[쇼츠 생성] TTS 실패');
                      return null;
              }

                    // 2. 음성 길이 측정
                const duration = await getAudioDuration(audioPath);
              console.log(`[쇼츠 생성] 음성 길이: ${duration.toFixed(1)}초`);

                  // 3. 자막 파일 생성
              const subtitleContent = generateSubtitleASS(script.subtitleLines, duration);
              await writeFile(subtitlePath, subtitleContent, 'utf-8');

                  // 4. FFmpeg로 영상 합성
              const videoOk = await generateVideo(audioPath, subtitlePath, outputPath, duration);
              if (!videoOk) {
                console.error('[쇼츠 생성] 영상 합성 실패');
                      return null;
              }

                console.log(`[쇼츠 생성] ✅ 완료: ${outputPath}`);
                  return outputPath;

            } catch (err) {
              console.error(`[쇼츠 생성 에러] ${err.message}`);
                  return null;
            }
          }

            // 임시 파일 정리
            export async function cleanupTempFiles() {
                const tmpDir = '/tmp/shorts';
              try {
                const dateStr = new Date().toISOString().split('T')[0];
                const files = [
                  `${tmpDir}/tts_${dateStr}.mp3`,
                  `${tmpDir}/sub_${dateStr}.ass`,
                  `${tmpDir}/shorts_${dateStr}.mp4`,
                ];
                for (const f of files) {
                  if (existsSync(f)) await unlink(f);
                }
                  console.log('[정리] 임시 파일 삭제 완료');
              } catch (err) {
                console.error(`[정리 에러] ${err.message}`);
              }
            }
