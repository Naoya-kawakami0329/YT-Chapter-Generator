import { JobStatus, ProcessStatus } from './types';

class JobStore {
  private static instance: JobStore;
  private jobs: Map<string, JobStatus>;

  private constructor() {
    this.jobs = new Map();
  }

  public static getInstance(): JobStore {
    if (!JobStore.instance) {
      JobStore.instance = new JobStore();
    }
    return JobStore.instance;
  }

  // ジョブの状態を取得
  public async getJobStatus(jobId: string): Promise<JobStatus | null> {
    try {
      const status = this.jobs.get(jobId);
      if (!status) {
        console.log(`ジョブが見つかりません: ${jobId}`);
        return null;
      }
      return status;
    } catch (error) {
      console.error('Error getting job status:', error);
      return null;
    }
  }

  // ジョブの状態を更新
  public async updateJobStatus(jobId: string, status: Partial<JobStatus>) {
    try {
      console.log(`ジョブステータスを更新中: ${jobId}`, status);
      const currentStatus = this.jobs.get(jobId) || {
        jobId,
        status: 'waiting' as ProcessStatus,
        progress: 0,
        createdAt: new Date().toISOString(),
      };

      const updatedStatus: JobStatus = {
        ...currentStatus,
        ...status,
        updatedAt: new Date().toISOString(),
      };

      this.jobs.set(jobId, updatedStatus);
      console.log(`ジョブステータス更新完了: ${jobId}`, updatedStatus);
      return updatedStatus;
    } catch (error) {
      console.error('Error updating job status:', error);
      throw error;
    }
  }

  // ジョブの結果を保存
  public async storeJobResult(jobId: string, result: string) {
    try {
      console.log(`ジョブ結果を保存中: ${jobId}`);
      const status = this.jobs.get(jobId);
      if (!status) {
        throw new Error(`ジョブが見つかりません（結果保存）: ${jobId}`);
      }

      const updatedStatus: JobStatus = {
        ...status,
        status: 'done' as ProcessStatus,
        progress: 100,
        result,
        completedAt: new Date().toISOString(),
      };
      this.jobs.set(jobId, updatedStatus);
      console.log(`ジョブ結果保存完了: ${jobId}`, updatedStatus);
      return updatedStatus;
    } catch (error) {
      console.error('Error storing job result:', error);
      throw error;
    }
  }

  // ジョブをエラー状態としてマーク
  public async markJobAsError(jobId: string, error: string) {
    try {
      console.log(`ジョブをエラー状態に設定中: ${jobId}`, error);
      const status = this.jobs.get(jobId);
      if (!status) {
        throw new Error(`ジョブが見つかりません（エラー設定）: ${jobId}`);
      }

      const updatedStatus: JobStatus = {
        ...status,
        status: 'error' as ProcessStatus,
        error,
        completedAt: new Date().toISOString(),
      };
      this.jobs.set(jobId, updatedStatus);
      console.log(`ジョブエラー状態設定完了: ${jobId}`, updatedStatus);
      return updatedStatus;
    } catch (error) {
      console.error('Error marking job as error:', error);
      throw error;
    }
  }

  // 現在のジョブ一覧を取得
  public async getAllJobs(): Promise<JobStatus[]> {
    return Array.from(this.jobs.values());
  }
}

// シングルトンインスタンスをエクスポート
const jobStore = JobStore.getInstance();

// 関数をエクスポート
export const getJobStatus = (jobId: string) => jobStore.getJobStatus(jobId);
export const updateJobStatus = (jobId: string, status: Partial<JobStatus>) =>
  jobStore.updateJobStatus(jobId, status);
export const storeJobResult = (jobId: string, result: string) =>
  jobStore.storeJobResult(jobId, result);
export const markJobAsError = (jobId: string, error: string) =>
  jobStore.markJobAsError(jobId, error);
export const getAllJobs = () => jobStore.getAllJobs();
