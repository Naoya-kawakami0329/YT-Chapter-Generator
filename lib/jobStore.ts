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
        return null;
      }
      return status;
    } catch (error) {
      return null;
    }
  }

  // ジョブの状態を更新
  public async updateJobStatus(jobId: string, status: Partial<JobStatus>) {
    try {
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
      return updatedStatus;
    } catch (error) {
      throw error;
    }
  }

  // ジョブの結果を保存
  public async storeJobResult(jobId: string, result: string) {
    try {
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
      return updatedStatus;
    } catch (error) {
      throw error;
    }
  }

  // ジョブをエラー状態としてマーク
  public async markJobAsError(jobId: string, error: string) {
    try {
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
      return updatedStatus;
    } catch (error) {
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
