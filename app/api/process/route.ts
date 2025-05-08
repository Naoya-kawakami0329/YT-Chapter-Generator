import { NextResponse } from 'next/server';
import { ProcessRequest, JobStatus, ProcessStatus } from '@/lib/types';
import YTDlpWrap from 'yt-dlp-wrap';
import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { updateJobStatus, storeJobResult, markJobAsError } from '@/lib/jobStore';


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
    outputPath = path.join(tempDir, `${jobId}.mp3`);

    // ジョブのステータスを初期化
    const initialStatus: JobStatus = {
      jobId,
      status: 'downloading',
      progress: 0,
    };
    updateJobStatus(jobId, initialStatus);
    console.log(`ジョブを初期化しました: ${jobId}`, initialStatus);

    // バックグラウンドで処理を開始
    processVideoAsync(url, language, jobId, outputPath);

    // 初期レスポンスを返す
    return createResponse({
      jobId,
      status: 'downloading',
    });
  } catch (error) {
    console.error('リクエスト処理中にエラーが発生しました:', error);
    
    // 一時ファイルがあれば削除
    cleanupTemporaryFile(outputPath);
    
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
  if (!url) return false;
  return url.includes('youtube.com/') || url.includes('youtu.be/');
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
function cleanupTemporaryFile(filePath: string | null): void {
  if (filePath && fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (error) {
      console.error('一時ファイルの削除中にエラーが発生しました:', error);
    }
  }
}

/**
 * バックグラウンドで動画を処理する
 */
function processVideoAsync(url: string, language: string, jobId: string, outputPath: string): void {
  processVideo(url, language, jobId, outputPath).catch((error) => {
    console.error(`ジョブ ${jobId} の処理中にエラーが発生しました:`, error);
    if (jobId) {
      markJobAsError(jobId, error instanceof Error ? error.message : '処理中にエラーが発生しました');
    }
  });
}

/**
 * 動画を処理してチャプターを生成する
 */
async function processVideo(url: string, language: string, jobId: string, outputPath: string): Promise<void> {
  try {
    // YouTube動画をダウンロード
    await downloadVideo(url, outputPath, jobId);

    // 音声をトランスクリプション
    const transcription = await transcribeAudio(outputPath, language, jobId);

    // チャプターを生成
    const chapters = await generateChapters(transcription);

    // 結果を保存
    storeJobResult(jobId, chapters);

    // 一時ファイルを削除
    cleanupTemporaryFile(outputPath);
  } catch (error) {
    console.error(`ジョブ ${jobId} のビデオ処理中にエラーが発生しました:`, error);
    markJobAsError(jobId, error instanceof Error ? error.message : '処理中にエラーが発生しました');
    
    // 一時ファイルを削除
    cleanupTemporaryFile(outputPath);
    
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
      '-x', // 音声を抽出
      '--audio-format', 'mp3',
      '--audio-quality', '0', // 最高品質
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
 * 音声ファイルをトランスクリプションする
 */
async function transcribeAudio(audioPath: string, language: string, jobId: string) {
  try {
    const audioFile = fs.createReadStream(audioPath);

    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-1",
      language: language === 'auto' ? undefined : language,
      response_format: "verbose_json",
      timestamp_granularities: ["word"],
    });

    updateJobStatus(jobId, {
      status: 'generating',
      progress: 80,
    });

    return transcription;
  } catch (error) {
    console.error('音声のトランスクリプション中にエラーが発生しました:', error);
    throw new Error(`音声のトランスクリプションに失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
  }
}

/**
 * テキストからチャプターを生成する
 */
async function generateChapters(transcription: any): Promise<string> {
  try {
    // トランスクリプションの構造を確認
    console.log('トランスクリプション構造:', JSON.stringify(transcription, null, 2));

    // 単語ごとのタイムスタンプを取得
    const words = transcription.words || [];
    if (words.length === 0) {
      throw new Error('トランスクリプションに単語データが含まれていません');
    }

    // 文章の区切りを検出
    const segments: { text: string; start: number; end: number }[] = [];
    let currentSegment = { text: '', start: words[0].start, end: 0 };

    for (const word of words) {
      currentSegment.text += word.word + ' ';
      currentSegment.end = word.end;

      // 文末の句点や感嘆符で区切る
      if (word.word.match(/[.!?]$/)) {
        segments.push({
          text: currentSegment.text.trim(),
          start: currentSegment.start,
          end: currentSegment.end
        });
        currentSegment = { text: '', start: word.end, end: word.end };
      }
    }

    // 最後のセグメントを追加
    if (currentSegment.text.trim()) {
      segments.push({
        text: currentSegment.text.trim(),
        start: currentSegment.start,
        end: currentSegment.end
      });
    }

    // セグメントをグループ化してチャプターを生成
    const chapters: string[] = [];
    let currentChapter = { text: '', start: 0, end: 0 };
    let segmentCount = 0;

    for (const segment of segments) {
      currentChapter.text += segment.text + ' ';
      currentChapter.end = segment.end;
      segmentCount++;

      // 5つのセグメントごとにチャプターを作成
      if (segmentCount >= 5) {
        const minutes = Math.floor(currentChapter.start / 60);
        const seconds = Math.floor(currentChapter.start % 60);
        chapters.push(
          `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')} ${currentChapter.text.trim()}`
        );
        currentChapter = { text: '', start: segment.end, end: segment.end };
        segmentCount = 0;
      }
    }

    // 最後のチャプターを追加
    if (currentChapter.text.trim()) {
      const minutes = Math.floor(currentChapter.start / 60);
      const seconds = Math.floor(currentChapter.start % 60);
      chapters.push(
        `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')} ${currentChapter.text.trim()}`
      );
    }

    return chapters.join('\n');
  } catch (error) {
    console.error('チャプターの生成中にエラーが発生しました:', error);
    throw new Error('チャプターの生成に失敗しました');
  }
}