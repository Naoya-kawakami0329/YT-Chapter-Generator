import { NextResponse } from 'next/server';
import { ProcessRequest, JobStatus, ProcessStatus } from '@/lib/types';
import YTDlpWrap from 'yt-dlp-wrap';
import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { updateJobStatus, storeJobResult, markJobAsError } from '@/lib/jobStore';

const execAsync = promisify(exec);

// 状態管理用のインメモリストレージ
const jobStatuses = new Map();

// OpenAI クライアントの初期化
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// yt-dlp の初期化
let ytDlp: YTDlpWrap | undefined;
try {
  ytDlp = new YTDlpWrap();
} catch (error) {
  console.error('yt-dlp の初期化に失敗しました:', error);
}

// 一時ディレクトリの作成
const tempDir = path.join(os.tmpdir(), 'yt-chapter-generator');
try {
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
} catch (error) {
  console.error('一時ディレクトリの作成に失敗しました:', error);
}

// 共通のヘッダー設定
const commonHeaders = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store, no-cache, must-revalidate',
};

/**
 * YouTube動画からチャプターを生成するAPIエンドポイント
 */
export async function POST(request: Request) {
  let jobId = null;
  let outputPath = null;
  let wavPath = null;

  try {
    // リクエストボディを解析
    const body = await parseRequestBody(request);
    if ('error' in body) {
      return createErrorResponse(body.error, 400);
    }

    const { url, language } = body;

    // URLを検証
    if (!isValidYoutubeUrl(url)) {
      return createErrorResponse('無効なYouTube URLです', 400);
    }

    // ジョブIDを生成
    jobId = generateJobId();
    outputPath = path.join(tempDir, `${jobId}.m4a`);
    wavPath = path.join(tempDir, `${jobId}.wav`);

    // ジョブの初期状態を保存
    const initialStatus: JobStatus = {
      jobId,
      status: 'processing',
      progress: 0,
      createdAt: new Date().toISOString(),
    };
    updateJobStatus(jobId, initialStatus);
    console.log(`ジョブを初期化しました: ${jobId}`, initialStatus);

    // バックグラウンドで処理を開始
    processVideoAsync(url, language, jobId, outputPath, wavPath);

    // 初期レスポンスを返す
    return createResponse({
      jobId,
      status: 'downloading',
    });
  } catch (error) {
    console.error('リクエスト処理中にエラーが発生しました:', error);
    
    // 一時ファイルを削除
    cleanupTemporaryFiles([outputPath, wavPath]);
    
    // エラーレスポンスを返す
    return createErrorResponse(
      error instanceof Error ? error.message : 'リクエストの処理に失敗しました',
      500,
      {
        jobId: jobId || undefined,
        details: error instanceof Error ? error.stack : undefined,
      }
    );
  }
}

/**
 * ジョブのステータスを取得するエンドポイント
 */
export async function GET(
  request: Request,
  { params }: { params: { jobId: string } }
) {
  try {
    if (!params || !params.jobId) {
      return createErrorResponse('ジョブIDが指定されていません', 400);
    }

    const jobId = params.jobId;
    const status = jobStatuses.get(jobId);

    if (!status) {
      return createErrorResponse('ジョブが見つかりません', 404);
    }

    return createResponse(status);
  } catch (error) {
    console.error('ステータスAPI内でエラーが発生しました:', error);
    return createErrorResponse(
      'ジョブのステータス取得に失敗しました',
      500,
      {
        details: error instanceof Error ? error.message : '不明なエラー',
      }
    );
  }
}

/**
 * リクエストボディを解析する
 */
async function parseRequestBody(request: Request) {
  try {
    return await request.json();
  } catch (error) {
    console.error('リクエストボディの解析に失敗しました:', error);
    return { error: '無効なリクエストボディです' };
  }
}

/**
 * YouTube URLが有効かどうかを検証する
 */
function isValidYoutubeUrl(url: string): boolean {
  return url?.includes('youtube.com/') || url?.includes('youtu.be/');
}

/**
 * 一意のジョブIDを生成する
 */
function generateJobId(): string {
  return `job-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * JSONレスポンスを作成する
 */
function createResponse(data: any, status = 200): Response {
  return new Response(
    JSON.stringify(data),
    { 
      status,
      headers: commonHeaders,
    }
  );
}

/**
 * エラーレスポンスを作成する
 */
function createErrorResponse(message: string, status = 500, additionalData = {}): Response {
  return new Response(
    JSON.stringify({ 
      error: message,
      ...additionalData,
    }),
    { 
      status,
      headers: commonHeaders,
    }
  );
}

/**
 * 一時ファイルを削除する
 */
function cleanupTemporaryFiles(filePaths: (string | null)[]): void {
  filePaths.forEach(filePath => {
    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (error) {
        console.error('一時ファイルの削除中にエラーが発生しました:', error);
      }
    }
  });
}

/**
 * バックグラウンドで動画を処理する
 */
function processVideoAsync(url: string, language: string, jobId: string, outputPath: string, wavPath: string): void {
  processVideo(url, language, jobId, outputPath, wavPath).catch((error) => {
    console.error(`ジョブ ${jobId} の処理中にエラーが発生しました:`, error);
    if (jobId) {
      markJobAsError(jobId, error instanceof Error ? error.message : '処理中にエラーが発生しました');
    }
  });
}

/**
 * 動画を処理してチャプターを生成する
 */
async function processVideo(url: string, language: string, jobId: string, outputPath: string, wavPath: string): Promise<void> {
  try {
    // YouTube動画をダウンロード
    await downloadVideo(url, outputPath, jobId);

    // 音声をWAV形式に変換
    await convertToWav(outputPath, wavPath);

    // 音声を分割
    const chunks = await splitAudio(wavPath);

    // 音声をトランスクリプション
    const transcription = await transcribeAudio(wavPath, language, jobId);

    // チャプターを生成
    const chapters = await generateChapters(transcription);

    // 結果を保存
    storeJobResult(jobId, chapters);

    // 一時ファイルを削除
    cleanupTemporaryFiles([outputPath, wavPath]);
  } catch (error) {
    console.error(`ジョブ ${jobId} のビデオ処理中にエラーが発生しました:`, error);
    markJobAsError(jobId, error instanceof Error ? error.message : '処理中にエラーが発生しました');
    
    // 一時ファイルを削除
    cleanupTemporaryFiles([outputPath, wavPath]);
    
    throw error;
  }
}

/**
 * YouTube動画をダウンロードする
 */
async function downloadVideo(url: string, outputPath: string, jobId: string): Promise<void> {
  if (!ytDlp) {
    throw new Error('yt-dlpが初期化されていません');
  }

  try {
    await ytDlp.execPromise([
      url,
      '-f', 'ba[ext=m4a]', // 音声ストリームを取得
      '-o', outputPath,
    ]);
    
    updateJobStatus(jobId, {
      status: 'transcribing',
      progress: 30,
    });
  } catch (error) {
    console.error('動画のダウンロード中にエラーが発生しました:', error);
    throw new Error(`動画のダウンロードに失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
  }
}

/**
 * 音声ファイルをWAV形式に変換する
 */
async function convertToWav(inputPath: string, outputPath: string): Promise<void> {
  try {
    console.log('音声ファイルの変換を開始:', inputPath);
    
    // 入力ファイルの存在確認
    if (!fs.existsSync(inputPath)) {
      throw new Error(`入力ファイルが存在しません: ${inputPath}`);
    }
    
    // 入力ファイルのサイズ確認
    const inputStats = fs.statSync(inputPath);
    console.log('入力ファイルサイズ:', inputStats.size, 'bytes');
    
    // ffmpegコマンドの実行
    const command = `ffmpeg -y -i "${inputPath}" -ar 16000 -ac 1 -vn "${outputPath}"`;
    console.log('実行コマンド:', command);
    
    const { stdout, stderr } = await execAsync(command);
    console.log('変換完了:', { stdout, stderr });
    
    // 出力ファイルの確認
    if (!fs.existsSync(outputPath)) {
      throw new Error('変換後のファイルが存在しません');
    }
    
    const outputStats = fs.statSync(outputPath);
    console.log('変換後のファイルサイズ:', outputStats.size, 'bytes');
    
    if (outputStats.size === 0) {
      throw new Error('変換後のファイルが空です');
    }
  } catch (error) {
    console.error('音声ファイルの変換中にエラーが発生しました:', error);
    throw new Error(`音声ファイルの変換に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
  }
}

/**
 * 音声ファイルを分割する
 */
async function splitAudio(inputFile: string): Promise<string[]> {
  try {
    console.log('音声ファイルの分割を開始:', inputFile);
    
    // 入力ファイルの存在確認
    if (!fs.existsSync(inputFile)) {
      throw new Error('入力ファイルが見つかりません');
    }

    // 音声の長さを取得
    const { stdout, stderr } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${inputFile}"`
    );

    if (stderr) {
      console.error('ffprobeエラー:', stderr);
    }

    if (!stdout) {
      throw new Error('音声の長さを取得できませんでした');
    }

    const durationStr = stdout.toString().trim();
    const duration = parseFloat(durationStr);

    if (isNaN(duration) || duration <= 0) {
      throw new Error(`無効な音声の長さが取得されました: ${durationStr}`);
    }

    console.log('音声の長さ:', duration, '秒');

    // Whisper APIの制限（25MB）を考慮してチャンクサイズを調整
    const CHUNK_SIZE = 600; // 10分
    const chunks: string[] = [];
    let startTime = 0;

    while (startTime < duration) {
      const chunkFile = path.join(os.tmpdir(), 'yt-chapter-generator', `chunk_${startTime}.wav`);
      console.log(`チャンク生成中: ${startTime}秒から`);
      
      const command = `ffmpeg -y -i "${inputFile}" -ss ${startTime} -t ${CHUNK_SIZE} -ar 16000 -ac 1 -vn "${chunkFile}"`;
      console.log('実行コマンド:', command);
      
      const { stdout: ffmpegStdout, stderr: ffmpegStderr } = await execAsync(command);
      
      if (ffmpegStderr) {
        console.error('ffmpegエラー:', ffmpegStderr);
      }
      
      // チャンクファイルのサイズを確認
      const stats = fs.statSync(chunkFile);
      console.log(`チャンク生成完了: ${chunkFile} (${stats.size} bytes)`);
      
      // 空のチャンクファイルを削除
      if (stats.size === 0) {
        fs.unlinkSync(chunkFile);
        console.log('空のチャンクファイルを削除:', chunkFile);
      } else {
        chunks.push(chunkFile);
      }
      
      startTime += CHUNK_SIZE;
    }

    if (chunks.length === 0) {
      throw new Error('有効なチャンクが生成されませんでした');
    }

    console.log('分割完了:', chunks.length, '個のチャンクを生成');
    return chunks;
  } catch (error) {
    console.error('音声ファイルの分割中にエラー:', error);
    throw error;
  }
}

/**
 * 音声ファイルをトランスクリプションする
 */
async function transcribeAudio(audioPath: string, language: string, jobId: string) {
  try {
    console.log('トランスクリプション開始:', audioPath);
    
    // 音声ファイルを分割
    const chunks = await splitAudio(audioPath);
    console.log(`音声ファイルを${chunks.length}個のチャンクに分割しました`);

    // 各チャンクを並列でトランスクリプション
    const transcriptions = await Promise.all(
      chunks.map(async (chunkPath, index) => {
        console.log(`チャンク${index + 1}/${chunks.length}のトランスクリプション開始`);
        const audioFile = fs.createReadStream(chunkPath);
        
        try {
          const transcription = await openai.audio.transcriptions.create({
            file: audioFile,
            model: "whisper-1",
            language: language === 'auto' ? undefined : language,
            response_format: "verbose_json",
            timestamp_granularities: ["word", "segment"],
          });

          console.log(`チャンク${index + 1}のトランスクリプション完了:`, {
            textLength: transcription.text.length,
            wordCount: transcription.words?.length || 0,
            segmentCount: transcription.segments?.length || 0
          });

          // 進捗を更新
          const progress = 30 + Math.floor((index + 1) / chunks.length * 50);
          updateJobStatus(jobId, {
            status: 'transcribing',
            progress,
          });

          return transcription;
        } catch (error) {
          console.error(`チャンク${index + 1}のトランスクリプション中にエラー:`, error);
          throw error;
        }
      })
    );

    // チャンクを結合
    const combinedTranscription = {
      text: transcriptions.map(t => t.text).join(' '),
      words: transcriptions.flatMap((t, chunkIndex) => {
        // 各チャンクの単語を適切に結合
        const words = t.words || [];
        const chunkOffset = chunkIndex * 600; // 各チャンクは600秒
        return words.map(word => ({
          word: word.word.trim(),
          start: Math.round((word.start + chunkOffset) * 100) / 100, // 小数点2桁まで
          end: Math.round((word.end + chunkOffset) * 100) / 100
        })).filter(word => word.word.length > 0);
      }),
      segments: transcriptions.flatMap((t, chunkIndex) => {
        // 各チャンクのセグメントを適切に結合
        const segments = t.segments || [];
        const chunkOffset = chunkIndex * 600;
        return segments.map(segment => ({
          text: segment.text.trim(),
          start: Math.round((segment.start + chunkOffset) * 100) / 100,
          end: Math.round((segment.end + chunkOffset) * 100) / 100
        }));
      })
    };

    console.log('トランスクリプション完了:', {
      totalTextLength: combinedTranscription.text.length,
      totalWordCount: combinedTranscription.words.length,
      totalSegmentCount: combinedTranscription.segments.length,
      sampleWords: combinedTranscription.words.slice(0, 5),
      sampleSegments: combinedTranscription.segments.slice(0, 3)
    });

    updateJobStatus(jobId, {
      status: 'generating',
      progress: 80,
    });

    return combinedTranscription;
  } catch (error) {
    console.error('音声のトランスクリプション中にエラーが発生しました:', error);
    throw new Error(`音声のトランスクリプションに失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
  }
}

/**
 * 動画の長さに基づいてチャプター数を決定する
 */
function determineChapterCount(durationInSeconds: number): { min: number; max: number } {
  const durationInMinutes = durationInSeconds / 60;
  
  if (durationInMinutes <= 15) {
    return { min: 3, max: 5 };
  } else if (durationInMinutes <= 30) {
    return { min: 5, max: 8 };
  } else if (durationInMinutes <= 60) {
    return { min: 8, max: 12 };
  } else if (durationInMinutes <= 120) {
    return { min: 12, max: 20 };
  } else {
    return { min: 15, max: 30 };
  }
}

/**
 * テキストからチャプターを生成する
 */
async function generateChapters(transcription: any): Promise<string> {
  try {
    // トランスクリプションの構造を確認
    if (!transcription || typeof transcription !== 'object') {
      throw new Error('無効なトランスクリプションデータです');
    }

    // セグメントと単語のデータを取得
    const segments = transcription.segments || [];
    const words = transcription.words || [];

    if (!Array.isArray(segments) || segments.length === 0) {
      throw new Error('トランスクリプションに有効なセグメントデータが含まれていません');
    }

    // 動画の総再生時間を取得（最後のセグメントの終了時間）
    const totalDuration = Math.ceil(segments[segments.length - 1].end);
    const { min: minChapters, max: maxChapters } = determineChapterCount(totalDuration);

    console.log('動画の総再生時間:', formatTime(totalDuration));
    console.log('チャプター設定:', { minChapters, maxChapters });

    // セグメントを話題の区切りでグループ化
    const topicGroups: { start: number; texts: string[]; segments: any[] }[] = [];
    let currentGroup = { 
      start: segments[0].start, 
      texts: [segments[0].text],
      segments: [segments[0]]
    };

    for (let i = 1; i < segments.length; i++) {
      const currentSegment = segments[i];
      const prevSegment = segments[i - 1];
      
      // セグメント間の間隔を計算
      const gap = currentSegment.start - prevSegment.end;

      // 5秒以上の間隔、または重要な話題の転換を示すキーワードがある場合に新しいグループを作成
      const hasTopicChange = /(では|それでは|次に|ところで|さて|ということで|まとめ|結論|重要な|ポイント|注意点|最後に)/.test(currentSegment.text);
      const hasLongGap = gap > 5;
      
      if (hasLongGap || hasTopicChange) {
        if (currentGroup.texts.length > 0) {
          topicGroups.push(currentGroup);
        }
        currentGroup = { 
          start: currentSegment.start, 
          texts: [currentSegment.text],
          segments: [currentSegment]
        };
      } else {
        currentGroup.texts.push(currentSegment.text);
        currentGroup.segments.push(currentSegment);
      }
    }

    // 最後のグループを追加
    if (currentGroup.texts.length > 0) {
      topicGroups.push(currentGroup);
    }

    // グループ数が多すぎる場合は、類似したグループをマージ
    while (topicGroups.length > maxChapters) {
      let minDuration = Infinity;
      let mergeIndex = 0;

      // 最も短い間隔のグループを見つける
      for (let i = 0; i < topicGroups.length - 1; i++) {
        const duration = topicGroups[i + 1].start - topicGroups[i].start;
        if (duration < minDuration) {
          minDuration = duration;
          mergeIndex = i;
        }
      }

      // グループをマージ
      topicGroups[mergeIndex].texts = topicGroups[mergeIndex].texts.concat(topicGroups[mergeIndex + 1].texts);
      topicGroups[mergeIndex].segments = topicGroups[mergeIndex].segments.concat(topicGroups[mergeIndex + 1].segments);
      topicGroups.splice(mergeIndex + 1, 1);
    }

    console.log('話題グループ数:', topicGroups.length);

    // グループ化されたセグメントを文字列に変換
    const formattedSegments = topicGroups
      .map((group, index) => {
        const summary = group.texts.join(' ').slice(0, 100) + '...';
        const startTime = Math.round(group.start * 100) / 100; // 小数点2桁まで
        return `[${formatTime(startTime)}] ${summary}`;
      })
      .join('\n');

    // GPT-4にチャプター生成を依頼
    const prompt = `以下の文字起こしから、重要な話題の切れ目を検出して${minChapters}〜${maxChapters}個のチャプターを生成してください。
各チャプターは「MM:SS 章タイトル」の形式で、必ず00:00から始めてください。
文字起こしの内容を要約し、最も重要なポイントを章タイトルとして抽出してください。
話題の転換点を重視して、自然な区切りでチャプターを設定してください。
等間隔ではなく、内容の流れに沿ってチャプターを設定してください。
細かい話題の変化は無視し、大きな話題の転換点のみをチャプターとして設定してください。
各セグメントの開始時間を正確に使用してください。

文字起こし:
${formattedSegments}

チャプター形式:
00:00 導入
MM:SS 章タイトル
...`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { 
          role: "system", 
          content: `あなたは動画のチャプターを生成する専門家です。
各セグメントの開始時間を参考に、重要な話題の転換点を重視してチャプターを設定してください。
必ず「MM:SS 章タイトル」の形式で出力してください。
チャプター数は${minChapters}〜${maxChapters}個を目安に、内容の流れに沿って自然な区切りで設定してください。
等間隔ではなく、話題の切れ目を重視してください。
細かい話題の変化は無視し、大きな話題の転換点のみをチャプターとして設定してください。
各セグメントの開始時間を正確に使用してください。` 
        },
        { role: "user", content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    const result = completion.choices[0].message.content;
    if (!result) {
      throw new Error('GPT-4からの応答が空でした');
    }

    console.log('生成されたチャプター:', result);
    return result;
  } catch (error) {
    console.error('チャプターの生成中にエラーが発生しました:', error);
    if (error instanceof Error) {
      console.error('エラーの詳細:', error.message);
      console.error('スタックトレース:', error.stack);
    }
    throw new Error(`チャプターの生成に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
  }
}

/**
 * 秒数をMM:SS形式に変換する
 */
function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}