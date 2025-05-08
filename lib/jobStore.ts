import { JobStatus, ProcessStatus } from './types';

class JobStore {
  private static instance: JobStore;
  private jobStatuses: Map<string, JobStatus>;

  private constructor() {
    this.jobStatuses = new Map<string, JobStatus>();
  }

  public static getInstance(): JobStore {
    if (!JobStore.instance) {
      JobStore.instance = new JobStore();
    }
    return JobStore.instance;
  }

  // ジョブの状態を取得
  public getJobStatus(jobId: string): JobStatus | undefined {
    return this.jobStatuses.get(jobId);
  }

  // ジョブの状態を更新
  public updateJobStatus(jobId: string, status: Partial<JobStatus>) {
    try {
      console.log(`ジョブステータスを更新中: ${jobId}`, status);
      const currentStatus = this.jobStatuses.get(jobId) || {
        jobId,
        status: 'waiting' as ProcessStatus,
        progress: 0,
      };

      const updatedStatus: JobStatus = {
        ...currentStatus,
        ...status,
      };

      this.jobStatuses.set(jobId, updatedStatus);
      console.log(`ジョブステータス更新完了: ${jobId}`, updatedStatus);
      console.log('現在のジョブ一覧:', this.getAllJobs());
    } catch (error) {
      console.error('Error updating job status:', error);
    }
  }

  // ジョブの結果を保存
  public storeJobResult(jobId: string, result: string) {
    try {
      console.log(`ジョブ結果を保存中: ${jobId}`);
      const status = this.jobStatuses.get(jobId);
      if (status) {
        const updatedStatus: JobStatus = {
          ...status,
          status: 'done' as ProcessStatus,
          progress: 100,
          result,
        };
        this.jobStatuses.set(jobId, updatedStatus);
        console.log(`ジョブ結果保存完了: ${jobId}`, updatedStatus);
      } else {
        console.error(`ジョブが見つかりません（結果保存）: ${jobId}`);
      }
    } catch (error) {
      console.error('Error storing job result:', error);
    }
  }

  // ジョブをエラー状態としてマーク
  public markJobAsError(jobId: string, error: string) {
    try {
      console.log(`ジョブをエラー状態に設定中: ${jobId}`, error);
      const status = this.jobStatuses.get(jobId);
      if (status) {
        const updatedStatus: JobStatus = {
          ...status,
          status: 'error' as ProcessStatus,
          error,
        };
        this.jobStatuses.set(jobId, updatedStatus);
        console.log(`ジョブエラー状態設定完了: ${jobId}`, updatedStatus);
      } else {
        console.error(`ジョブが見つかりません（エラー設定）: ${jobId}`);
      }
    } catch (error) {
      console.error('Error marking job as error:', error);
    }
  }

  // 現在のジョブ一覧を取得
  public getAllJobs(): string[] {
    return Array.from(this.jobStatuses.keys());
  }
}

// シングルトンインスタンスをエクスポート
const jobStore = JobStore.getInstance();

// 関数をエクスポート
export const getJobStatus = (jobId: string) => jobStore.getJobStatus(jobId);
export const updateJobStatus = (jobId: string, status: Partial<JobStatus>) => jobStore.updateJobStatus(jobId, status);
export const storeJobResult = (jobId: string, result: string) => jobStore.storeJobResult(jobId, result);
export const markJobAsError = (jobId: string, error: string) => jobStore.markJobAsError(jobId, error);
export const getAllJobs = () => jobStore.getAllJobs(); 