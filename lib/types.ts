export type ProcessStatus = 'idle' | 'waiting' | 'downloading' | 'transcribing' | 'generating' | 'done' | 'error';

export interface ProcessRequest {
  url: string;
  language: string;
}

export interface ProcessResponse {
  jobId: string;
  status: ProcessStatus;
}

export interface JobStatus {
  jobId: string;
  status: ProcessStatus;
  progress: number;
  result?: string;
  error?: string;
  createdAt?: string;   // 追加: ジョブ作成日時
  updatedAt?: string;   // 追加: 最終更新日時
  completedAt?: string; // 追加: ジョブ完了日時
}