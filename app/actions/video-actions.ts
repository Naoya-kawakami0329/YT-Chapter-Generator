'use server';

import { revalidatePath } from 'next/cache';
import { JobStatus } from '@/lib/types';
import OpenAI from 'openai';
import axios from 'axios';
import { updateJobStatus, storeJobResult, markJobAsError } from '@/lib/jobStore';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = 'youtube-transcript3.p.rapidapi.com';

export async function processVideoAction(prevState: any, formData: FormData) {
  const url = formData.get('url') as string;
  const language = formData.get('language') as string;

  if (!url || !language) {
    return {
      success: false,
      error: 'URLと言語を入力してください',
    };
  }

  if (!isValidYoutubeUrl(url)) {
    return {
      success: false,
      error: '無効なYouTube URLです',
    };
  }

  try {
    const jobId = generateJobId();

    const initialStatus: JobStatus = {
      jobId,
      status: 'processing',
      progress: 0,
      createdAt: new Date().toISOString(),
    };
    await updateJobStatus(jobId, initialStatus);

    processVideoAsync(url, language, jobId);

    revalidatePath('/');

    return {
      success: true,
      jobId,
      status: 'processing',
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'リクエストの処理に失敗しました',
    };
  }
}

export async function getJobStatusAction(jobId: string) {
  try {
    const { getJobStatus } = await import('@/lib/jobStore');
    const status = await getJobStatus(jobId);

    if (!status) {
      return {
        success: false,
        error: 'ジョブが見つかりません',
      };
    }

    return {
      success: true,
      data: status,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'ステータスの取得に失敗しました',
    };
  }
}

function isValidYoutubeUrl(url: string): boolean {
  return url?.includes('youtube.com/') || url?.includes('youtu.be/');
}

function generateJobId(): string {
  return `job-${Math.random().toString(36).substring(2, 11)}`;
}

function processVideoAsync(url: string, language: string, jobId: string): void {
  processVideo(url, language, jobId).catch((error) => {
    if (jobId) {
      markJobAsError(
        jobId,
        error instanceof Error ? error.message : '処理中にエラーが発生しました'
      );
    }
  });
}

async function processVideo(url: string, language: string, jobId: string): Promise<void> {
  try {
    const transcription = await getYouTubeTranscript(url, language, jobId);
    const chapters = await generateChapters(transcription);
    storeJobResult(jobId, chapters);
  } catch (error) {
    markJobAsError(jobId, error instanceof Error ? error.message : '処理中にエラーが発生しました');
    throw error;
  }
}

async function getYouTubeTranscript(url: string, language: string, jobId: string) {
  try {
    const videoId = extractVideoId(url);
    if (!videoId) {
      throw new Error('無効なYouTube URLです');
    }

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

    updateJobStatus(jobId, {
      status: 'generating',
      progress: 80,
    });

    const transcript = response.data.transcript;

    const processedTranscript = transcript.map((item: any) => {
      const start = parseFloat(item.offset);
      const end = start + parseFloat(item.duration);

      return {
        text: item.text,
        start,
        end,
      };
    });

    return {
      text: processedTranscript.map((item: any) => item.text).join(' '),
      segments: processedTranscript,
    };
  } catch (error) {
    throw new Error(
      `字幕の取得に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`
    );
  }
}

function extractVideoId(url: string): string | null {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? match[2] : null;
}

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

async function generateChapters(transcription: any): Promise<string> {
  try {
    if (!transcription || typeof transcription !== 'object') {
      throw new Error('無効なトランスクリプションデータです');
    }

    const segments = transcription.segments || [];

    if (!Array.isArray(segments) || segments.length === 0) {
      throw new Error('トランスクリプションに有効なセグメントデータが含まれていません');
    }

    const totalDuration = Math.ceil(segments[segments.length - 1].end);
    const { min: minChapters, max: maxChapters } = determineChapterCount(totalDuration);

    const topicGroups: { start: number; texts: string[]; segments: any[] }[] = [];
    let currentGroup = {
      start: segments[0].start,
      texts: [segments[0].text],
      segments: [segments[0]],
    };

    for (let i = 1; i < segments.length; i++) {
      const currentSegment = segments[i];
      const prevSegment = segments[i - 1];

      const gap = currentSegment.start - prevSegment.end;

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

    if (currentGroup.texts.length > 0) {
      topicGroups.push(currentGroup);
    }

    while (topicGroups.length > maxChapters) {
      let minDuration = Infinity;
      let mergeIndex = 0;

      for (let i = 0; i < topicGroups.length - 1; i++) {
        const duration = topicGroups[i + 1].start - topicGroups[i].start;
        if (duration < minDuration) {
          minDuration = duration;
          mergeIndex = i;
        }
      }

      topicGroups[mergeIndex].texts = topicGroups[mergeIndex].texts.concat(
        topicGroups[mergeIndex + 1].texts
      );
      topicGroups[mergeIndex].segments = topicGroups[mergeIndex].segments.concat(
        topicGroups[mergeIndex + 1].segments
      );
      topicGroups.splice(mergeIndex + 1, 1);
    }

    const formattedSegments = topicGroups
      .map((group, index) => {
        const summary = group.texts.join(' ').slice(0, 100) + '...';
        const startTime = Math.round(group.start * 100) / 100;
        return `${formatTime(startTime)} ${summary}`;
      })
      .join('\n');

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

    return result;
  } catch (error) {
    throw new Error(
      `チャプターの生成に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`
    );
  }
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}
