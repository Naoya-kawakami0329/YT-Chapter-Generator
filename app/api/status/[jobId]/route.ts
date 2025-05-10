import { NextResponse } from 'next/server';
import { JobStatus, ProcessStatus } from '@/lib/types';
import { getJobStatus, getAllJobs } from '@/lib/jobStore';

// Enable dynamic routing
export const dynamic = 'force-dynamic';

// In-memory job status storage
// In a production environment, this should be replaced with a proper database
const jobStatuses = new Map<string, JobStatus>();

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
    console.log('ステータス取得リクエスト:', params);

    // パラメータを非同期で処理
    const jobId = await Promise.resolve(params.jobId);
    
    if (!jobId) {
      console.error('ジョブIDが指定されていません');
      return createErrorResponse('ジョブIDが指定されていません', 400);
    }

    console.log('ジョブID:', jobId);

    const status = getJobStatus(jobId);
    console.log('取得したステータス:', status);

    if (!status) {
      console.error('ジョブが見つかりません:', jobId);
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

// Helper function to update job status
export function updateJobStatus(jobId: string, status: Partial<JobStatus>) {
  try {
    console.log(`ジョブステータスを更新中: ${jobId}`, status);
    const currentStatus = jobStatuses.get(jobId) || {
      jobId,
      status: 'waiting' as ProcessStatus,
      progress: 0,
    };

    const updatedStatus: JobStatus = {
      ...currentStatus,
      ...status,
    };

    jobStatuses.set(jobId, updatedStatus);
    console.log(`ジョブステータス更新完了: ${jobId}`, updatedStatus);
  } catch (error) {
    console.error('Error updating job status:', error);
  }
}

// Helper function to store job result
export function storeJobResult(jobId: string, result: string) {
  try {
    console.log(`ジョブ結果を保存中: ${jobId}`);
    const status = jobStatuses.get(jobId);
    if (status) {
      const updatedStatus: JobStatus = {
        ...status,
        status: 'done' as ProcessStatus,
        progress: 100,
        result,
      };
      jobStatuses.set(jobId, updatedStatus);
      console.log(`ジョブ結果保存完了: ${jobId}`, updatedStatus);
    } else {
      console.error(`ジョブが見つかりません（結果保存）: ${jobId}`);
    }
  } catch (error) {
    console.error('Error storing job result:', error);
  }
}

// Helper function to mark job as error
export function markJobAsError(jobId: string, error: string) {
  try {
    console.log(`ジョブをエラー状態に設定中: ${jobId}`, error);
    const status = jobStatuses.get(jobId);
    if (status) {
      const updatedStatus: JobStatus = {
        ...status,
        status: 'error' as ProcessStatus,
        error,
      };
      jobStatuses.set(jobId, updatedStatus);
      console.log(`ジョブエラー状態設定完了: ${jobId}`, updatedStatus);
    } else {
      console.error(`ジョブが見つかりません（エラー設定）: ${jobId}`);
    }
  } catch (error) {
    console.error('Error marking job as error:', error);
  }
}