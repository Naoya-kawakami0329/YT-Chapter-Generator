import { NextResponse } from 'next/server';
import { getJobStatus } from '@/lib/jobStore';

// Enable dynamic routing
export const dynamic = 'force-dynamic';

// 共通のヘッダー設定
const commonHeaders = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store, no-cache, must-revalidate',
};

/**
 * ジョブのステータスを取得するAPIエンドポイント
 */
export async function GET(
  request: Request,
  { params }: { params: { jobId: string } }
) {
  try {
    const jobId = params.jobId;
    if (!jobId) {
      return NextResponse.json(
        { error: 'ジョブIDが指定されていません' },
        { 
          status: 400,
          headers: commonHeaders
        }
      );
    }

    console.log('ジョブステータスを取得中:', jobId);
    const status = await getJobStatus(jobId);
    
    if (!status) {
      console.log('ジョブが見つかりません:', jobId);
      return NextResponse.json(
        { error: 'ジョブが見つかりません' },
        { 
          status: 404,
          headers: commonHeaders
        }
      );
    }

    console.log('ジョブステータス取得成功:', status);
    return NextResponse.json(status, { headers: commonHeaders });
  } catch (error) {
    console.error('ステータス取得中にエラー:', error);
    return NextResponse.json(
      { error: 'ステータスの取得に失敗しました' },
      { 
        status: 500,
        headers: commonHeaders
      }
    );
  }
}