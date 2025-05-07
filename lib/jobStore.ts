import { JobStatus, ProcessStatus } from './types';

// 共有のジョブ状態ストレージ
const jobStatuses = new Map<string, JobStatus>();

// ジョブの状態を取得
export function getJobStatus(jobId: string): JobStatus | undefined {
  return jobStatuses.get(jobId);
}

// ジョブの状態を更新
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

// ジョブの結果を保存
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

// ジョブをエラー状態としてマーク
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

// 現在のジョブ一覧を取得
export function getAllJobs(): string[] {
  return Array.from(jobStatuses.keys());
} 