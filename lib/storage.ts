// @/lib/storage.ts
import fs from 'fs';
import path from 'path';
import { JobStatus } from '@/lib/types';

/**
 * ファイルベースの永続的なストレージ実装
 * 注: 本番環境では、RedisやMongoDBなどの適切なデータベースを使用することを推奨します
 */
class FileStorage {
  private storagePath: string;

  constructor() {
    // データ保存用のディレクトリを作成
    this.storagePath = path.join(process.cwd(), '.data');
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }
  }

  /**
   * ジョブデータを保存する
   */
  async saveJob(jobId: string, data: JobStatus): Promise<void> {
    const filePath = path.join(this.storagePath, `${jobId}.json`);
    try {
      await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
      console.error(`ジョブの保存中にエラーが発生しました (${jobId}):`, error);
      throw new Error(`ジョブの保存に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
    }
  }

  /**
   * ジョブデータを取得する
   */
  async getJob(jobId: string): Promise<JobStatus | null> {
    const filePath = path.join(this.storagePath, `${jobId}.json`);
    try {
      if (!fs.existsSync(filePath)) {
        return null;
      }
      const data = await fs.promises.readFile(filePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error(`ジョブの取得中にエラーが発生しました (${jobId}):`, error);
      throw new Error(`ジョブの取得に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
    }
  }

  /**
   * 全てのジョブを取得する
   */
  async getAllJobs(): Promise<JobStatus[]> {
    try {
      const files = await fs.promises.readdir(this.storagePath);
      const jsonFiles = files.filter(file => file.endsWith('.json'));
      
      const jobs = await Promise.all(
        jsonFiles.map(async (file) => {
          const jobId = path.basename(file, '.json');
          const job = await this.getJob(jobId);
          return job;
        })
      );
      
      return jobs.filter((job): job is JobStatus => job !== null);
    } catch (error) {
      console.error('全ジョブの取得中にエラーが発生しました:', error);
      throw new Error(`全ジョブの取得に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
    }
  }

  /**
   * 古いジョブデータをクリーンアップする
   * 24時間以上経過したジョブを削除
   */
  async cleanupOldJobs(): Promise<void> {
    try {
      const files = await fs.promises.readdir(this.storagePath);
      const jsonFiles = files.filter(file => file.endsWith('.json'));
      const now = Date.now();
      const oneDayMs = 24 * 60 * 60 * 1000;
      
      await Promise.all(
        jsonFiles.map(async (file) => {
          const filePath = path.join(this.storagePath, file);
          const stats = await fs.promises.stat(filePath);
          const fileAge = now - stats.mtimeMs;
          
          // 24時間以上経過したファイルを削除
          if (fileAge > oneDayMs) {
            await fs.promises.unlink(filePath);
            console.log(`古いジョブを削除しました: ${file}`);
          }
        })
      );
    } catch (error) {
      console.error('ジョブのクリーンアップ中にエラーが発生しました:', error);
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
  storage.cleanupOldJobs().catch(err => console.error('初期クリーンアップ中にエラーが発生しました:', err));
  
  // 12時間ごとに実行
  const CLEANUP_INTERVAL = 12 * 60 * 60 * 1000;
  setInterval(() => {
    storage.cleanupOldJobs().catch(err => console.error('定期クリーンアップ中にエラーが発生しました:', err));
  }, CLEANUP_INTERVAL);
}