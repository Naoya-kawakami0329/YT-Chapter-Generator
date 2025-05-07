"use client";

import { ProcessStatus } from '@/lib/types';
import { Progress } from '@/components/ui/progress';
import { ArrowDownIcon, CheckIcon, FileTextIcon, LoaderIcon, WavesIcon } from 'lucide-react';

interface ProgressModalProps {
  status: ProcessStatus;
  progress: number;
}

export default function ProgressModal({ status, progress }: ProgressModalProps) {
  const getStatusInfo = () => {
    switch (status) {
      case 'waiting':
        return {
          title: 'キューに追加中...',
          description: 'リクエストを処理するためのキューに追加しています。',
          icon: <LoaderIcon className="h-8 w-8 animate-spin" />
        };
      case 'downloading':
        return {
          title: 'ダウンロード中...',
          description: '動画から音声を取得しています。',
          icon: <ArrowDownIcon className="h-8 w-8 animate-bounce" />
        };
      case 'transcribing':
        return {
          title: '文字起こし中...',
          description: '音声を文字に変換しています。これには数分かかる場合があります。',
          icon: <WavesIcon className="h-8 w-8 animate-pulse" />
        };
      case 'generating':
        return {
          title: 'チャプター生成中...',
          description: '文字起こしデータからチャプターを作成しています。',
          icon: <FileTextIcon className="h-8 w-8 animate-pulse" />
        };
      case 'done':
        return {
          title: '完了！',
          description: 'チャプターの生成が完了しました。',
          icon: <CheckIcon className="h-8 w-8 text-green-500" />
        };
      default:
        return {
          title: '処理中...',
          description: 'しばらくお待ちください...',
          icon: <LoaderIcon className="h-8 w-8 animate-spin" />
        };
    }
  };

  const { title, description, icon } = getStatusInfo();

  return (
    <div className="w-full max-w-md bg-card rounded-lg shadow-lg p-6 border border-border">
      <div className="flex flex-col items-center text-center gap-4">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
          {icon}
        </div>
        
        <div>
          <h3 className="text-xl font-semibold">{title}</h3>
          <p className="text-muted-foreground mt-1">{description}</p>
        </div>
        
        <div className="w-full mt-4 space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">進捗状況</span>
            <span className="text-sm text-muted-foreground">{progress}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>
        
        {status === 'transcribing' && (
          <p className="text-xs text-muted-foreground italic mt-2">
            長い動画の場合は処理に時間がかかります。このページを開いたままにしてください。
          </p>
        )}
      </div>
    </div>
  );
}