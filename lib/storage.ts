// @/lib/storage.ts
import fs from 'fs/promises';
import path from 'path';
import { JobStatus } from '@/lib/types';

/**
 * ファイルベースの永続的なストレージ実装
 * 注: 本番環境では、RedisやMongoDBなどの適切なデータベースを使用することを推奨します
 */
export class FileStorage {
  private storageDir: string;

  constructor() {
    this.storageDir = path.join(process.cwd(), 'data', 'jobs');
    this.ensureStorageDir();
  }

  private async ensureStorageDir() {
    try {
      await fs.mkdir(this.storageDir, { recursive: true });
    } catch (error) {
      console.error('Error creating storage directory:', error);
      throw error;
    }
  }

  private getJobFilePath(jobId: string): string {
    return path.join(this.storageDir, `${jobId}.json`);
  }

  /**
   * ジョブデータを保存する
   */
  async saveJob(jobId: string, job: JobStatus): Promise<void> {
    try {
      const filePath = this.getJobFilePath(jobId);
      await fs.writeFile(filePath, JSON.stringify(job, null, 2), 'utf-8');
    } catch (error) {
      console.error('Error saving job:', error);
      throw error;
    }
  }

  /**
   * ジョブデータを取得する
   */
  async getJob(jobId: string): Promise<JobStatus | null> {
    try {
      const filePath = this.getJobFilePath(jobId);
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      console.error('Error reading job:', error);
      throw error;
    }
  }

  /**
   * 全てのジョブを取得する
   */
  async getAllJobs(): Promise<JobStatus[]> {
    try {
      const files = await fs.readdir(this.storageDir);
      const jobs = await Promise.all(
        files
          .filter(file => file.endsWith('.json'))
          .map(async file => {
            try {
              const data = await fs.readFile(path.join(this.storageDir, file), 'utf-8');
              return JSON.parse(data);
            } catch (error) {
              console.error(`Error reading job file ${file}:`, error);
              return null;
            }
          })
      );
      return jobs.filter((job): job is JobStatus => job !== null);
    } catch (error) {
      console.error('Error getting all jobs:', error);
      throw error;
    }
  }

  /**
   * 古いジョブデータをクリーンアップする
   * 24時間以上経過したジョブを削除
   */
  async cleanupOldJobs(): Promise<void> {
    try {
      const files = await fs.readdir(this.storageDir);
      const jsonFiles = files.filter(file => file.endsWith('.json'));
      const now = Date.now();
      const oneDayMs = 24 * 60 * 60 * 1000;
      
      await Promise.all(
        jsonFiles.map(async (file) => {
          try {
            const filePath = path.join(this.storageDir, file);
            const stats = await fs.stat(filePath);
            const fileAge = now - stats.mtimeMs;
            
            // 24時間以上経過したファイルを削除
            if (fileAge > oneDayMs) {
              await fs.unlink(filePath);
              console.log(`古いジョブを削除しました: ${file}`);
            }
          } catch (error) {
            console.error(`Error cleaning up job file ${file}:`, error);
          }
        })
      );
    } catch (error) {
      console.error('Error during cleanup:', error);
      throw error;
    }
  }
}

// シングルトンインスタンスをエクスポート
export const storage = new FileStorage();

// ユーティリティ関数
export async function updateJobStatus(jobId: string, status: Partial<JobStatus>): Promise<void> {
  try {
    // 既存のジョブを取得または新規作成
    const currentStatus = await storage.getJob(jobId) || {
      jobId,
      status: 'waiting',
      progress: 0,
      createdAt: new Date().toISOString(),
    };

    // ステータスを更新
    const updatedStatus = {
      ...currentStatus,
      ...status,
      updatedAt: new Date().toISOString(),
    };

    // 保存
    await storage.saveJob(jobId, updatedStatus);
  } catch (error) {
    console.error(`ジョブステータスの更新中にエラーが発生しました (${jobId}):`, error);
  }
}

export async function storeJobResult(jobId: string, result: string): Promise<void> {
  await updateJobStatus(jobId, {
    status: 'done',
    progress: 100,
    result,
    completedAt: new Date().toISOString(),
  });
}

export async function markJobAsError(jobId: string, error: string): Promise<void> {
  await updateJobStatus(jobId, {
    status: 'error',
    error,
    completedAt: new Date().toISOString(),
  });
}

// 定期的なクリーンアップを設定（サーバー起動時とその後12時間ごと）
// Node.jsでサーバーが常時稼働している場合にのみ有効
if (typeof setInterval !== 'undefined') {
  // 起動時に一度実行
  storage.cleanupOldJobs().catch(err => 
    console.error('初期クリーンアップ中にエラーが発生しました:', err)
  );
  
  // 12時間ごとに実行
  const CLEANUP_INTERVAL = 12 * 60 * 60 * 1000;
  setInterval(() => {
    storage.cleanupOldJobs().catch(err => 
      console.error('定期クリーンアップ中にエラーが発生しました:', err)
    );
  }, CLEANUP_INTERVAL);
}