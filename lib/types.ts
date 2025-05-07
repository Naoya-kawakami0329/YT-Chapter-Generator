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
}