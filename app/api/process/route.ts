import { NextResponse } from 'next/server';
import { ProcessRequest, JobStatus, ProcessStatus } from '@/lib/types';
import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import axios from 'axios';
import { updateJobStatus, storeJobResult, markJobAsError } from '@/lib/jobStore';

// OpenAI クライアントの初期化
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// RapidAPI の設定
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = 'youtube-transcript3.p.rapidapi.com';

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

  try {
    const body = await parseRequestBody(request);
    if ('error' in body) {
      return createErrorResponse(body.error, 400);
    }

    const { url, language } = body;

    if (!isValidYoutubeUrl(url)) {
      return createErrorResponse('無効なYouTube URLです', 400);
    }

    jobId = generateJobId();

    const initialStatus: JobStatus = {
      jobId,
      status: 'processing',
      progress: 0,
      createdAt: new Date().toISOString(),
    };
    updateJobStatus(jobId, initialStatus);

    processVideoAsync(url, language, jobId);

    return createResponse({
      jobId,
      status: 'processing',
    });
  } catch (error) {
    console.error('リクエスト処理中にエラーが発生しました:', error);
    return createErrorResponse(
      error instanceof Error ? error.message : 'リクエストの処理に失敗しました',
      500,
      { jobId: jobId || undefined }
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
  return new Response(JSON.stringify(data), {
    status,
    headers: commonHeaders,
  });
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
 * バックグラウンドで動画を処理する
 */
function processVideoAsync(url: string, language: string, jobId: string): void {
  processVideo(url, language, jobId).catch((error) => {
    console.error(`ジョブ ${jobId} の処理中にエラーが発生しました:`, error);
    if (jobId) {
      markJobAsError(
        jobId,
        error instanceof Error ? error.message : '処理中にエラーが発生しました'
      );
    }
  });
}

/**
 * 動画を処理してチャプターを生成する
 */
async function processVideo(url: string, language: string, jobId: string): Promise<void> {
  try {
    // YouTube動画の字幕を取得
    const transcription = await getYouTubeTranscript(url, language, jobId);

    // チャプターを生成
    const chapters = await generateChapters(transcription);

    // 結果を保存
    storeJobResult(jobId, chapters);
  } catch (error) {
    console.error(`ジョブ ${jobId} のビデオ処理中にエラーが発生しました:`, error);
    markJobAsError(jobId, error instanceof Error ? error.message : '処理中にエラーが発生しました');
    throw error;
  }
}

/**
 * YouTube動画の字幕を取得する
 */
async function getYouTubeTranscript(url: string, language: string, jobId: string) {
  try {
    console.log('字幕の取得を開始:', url);

    // ビデオIDを抽出
    const videoId = extractVideoId(url);
    if (!videoId) {
      throw new Error('無効なYouTube URLです');
    }

    // RapidAPIを使用して字幕を取得
    const response = await axios.get(`https://${RAPIDAPI_HOST}/api/transcript`, {
      params: {
        videoId: videoId,
        lang: language === 'auto' ? 'ja' : language,
      },
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': RAPIDAPI_HOST,
      },
    });

    if (!response.data || !response.data.transcript) {
      throw new Error('字幕の取得に失敗しました');
    }

    // APIの応答をログ出力
    console.log('RapidAPI Response:', JSON.stringify(response.data, null, 2));

    // 進捗を更新
    updateJobStatus(jobId, {
      status: 'generating',
      progress: 80,
    });

    // 字幕データの時間情報を修正
    const transcript = response.data.transcript;

    // 時間情報を秒単位に変換
    const processedTranscript = transcript.map((item: any) => {
      // offsetとdurationから開始時間と終了時間を計算
      const start = parseFloat(item.offset);
      const end = start + parseFloat(item.duration);

      return {
        text: item.text,
        start,
        end,
      };
    });

    // 動画の総再生時間を計算（最後の字幕の終了時間）
    const totalDuration = processedTranscript[processedTranscript.length - 1].end;

    return {
      text: processedTranscript.map((item: any) => item.text).join(' '),
      segments: processedTranscript,
    };
  } catch (error) {
    console.error('字幕の取得中にエラーが発生しました:', error);
    throw new Error(
      `字幕の取得に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`
    );
  }
}

/**
 * YouTube URLからビデオIDを抽出する
 */
function extractVideoId(url: string): string | null {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? match[2] : null;
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
      segments: [segments[0]],
    };

    for (let i = 1; i < segments.length; i++) {
      const currentSegment = segments[i];
      const prevSegment = segments[i - 1];

      // セグメント間の間隔を計算
      const gap = currentSegment.start - prevSegment.end;

      // 5秒以上の間隔、または重要な話題の転換を示すキーワードがある場合に新しいグループを作成
      const hasTopicChange =
        /(では|それでは|次に|ところで|さて|ということで|まとめ|結論|重要な|ポイント|注意点|最後に)/.test(
          currentSegment.text
        );
      const hasLongGap = gap > 5;

      if (hasLongGap || hasTopicChange) {
        if (currentGroup.texts.length > 0) {
          topicGroups.push(currentGroup);
        }
        currentGroup = {
          start: currentSegment.start,
          texts: [currentSegment.text],
          segments: [currentSegment],
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
      topicGroups[mergeIndex].texts = topicGroups[mergeIndex].texts.concat(
        topicGroups[mergeIndex + 1].texts
      );
      topicGroups[mergeIndex].segments = topicGroups[mergeIndex].segments.concat(
        topicGroups[mergeIndex + 1].segments
      );
      topicGroups.splice(mergeIndex + 1, 1);
    }

    console.log('話題グループ数:', topicGroups.length);

    // グループ化されたセグメントを文字列に変換
    const formattedSegments = topicGroups
      .map((group, index) => {
        const summary = group.texts.join(' ').slice(0, 100) + '...';
        const startTime = Math.round(group.start * 100) / 100; // 小数点2桁まで
        return `${formatTime(startTime)} ${summary}`;
      })
      .join('\n');

    // GPT-4にチャプター生成を依頼
    const prompt = `以下の文字起こしから、重要な話題の切れ目を検出して${minChapters}〜${maxChapters}個のチャプターを生成してください。
動画の総再生時間は${formatTime(totalDuration)}です。

文字起こし（時間と内容）:
${formattedSegments}

上記の文字起こしから、以下のルールに従ってチャプターを生成してください：
1. 各チャプターは「MM:SS 章タイトル」の形式で出力
2. 必ず00:00から始める
3. 最後のチャプターの時間は${formatTime(totalDuration)}を超えない
4. 文字起こしの時間を参考に、話題の転換点でチャプターを設定
5. 各セグメントの内容を要約して、適切な章タイトルを設定
6. チャプター数は${minChapters}〜${maxChapters}個を目安に

出力例：
00:00 導入と自己紹介
01:30 メインテーマの説明
03:45 具体的な事例の紹介
...`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: `あなたは動画のチャプターを生成する専門家です。
与えられた文字起こしから、時間と内容を考慮して適切なチャプターを生成してください。
必ず「MM:SS 章タイトル」の形式で出力し、00:00から始めてください。
動画の総再生時間（${formatTime(totalDuration)}）を超えないように注意してください。
各セグメントの時間と内容を参考に、自然な話題の転換点でチャプターを設定してください。`,
        },
        { role: 'user', content: prompt },
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
    throw new Error(
      `チャプターの生成に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`
    );
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
