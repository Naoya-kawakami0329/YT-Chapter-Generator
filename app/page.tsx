'use client';

import { useState, useEffect } from 'react';
import { Toaster } from '@/components/ui/toaster';
import Header from '@/components/Header';
import InputForm from '@/components/InputForm';
import ProgressModal from '@/components/ProgressModal';
import ResultsArea from '@/components/ResultsArea';
import { ProcessStatus } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';

export default function Home() {
  const [status, setStatus] = useState<ProcessStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const { toast } = useToast();

  // ジョブのステータスを定期的にチェック
  useEffect(() => {
    let intervalId: NodeJS.Timeout;
    let retryCount = 0;
    const MAX_RETRIES = 3;

    const checkJobStatus = async () => {
      if (!jobId) return;

      try {
        const { getJobStatusAction } = await import('@/app/actions/video-actions');
        const result = await getJobStatusAction(jobId);

        if (!result.success) {
          throw new Error(result.error || 'ステータスの取得に失敗しました');
        }

        const data = result.data;

        if (!data) {
          throw new Error('データが取得できませんでした');
        }

        // ステータスとプログレスの更新
        if (data.status !== status) {
          setStatus(data.status);
        }

        if (data.progress !== progress) {
          setProgress(data.progress);
        }

        // 完了またはエラーの処理
        if (data.status === 'done' && data.result) {
          setResult(data.result);
          setJobId(null);
          toast({
            title: '処理完了',
            description: 'チャプターの生成が完了しました',
          });
        } else if (data.status === 'error') {
          setJobId(null);
          toast({
            title: 'エラー',
            description: data.error || '処理中にエラーが発生しました',
            variant: 'destructive',
          });
        }
      } catch (error) {
        if (retryCount < MAX_RETRIES) {
          retryCount++;
          return;
        }
        setJobId(null);
        toast({
          title: 'エラー',
          description: error instanceof Error ? error.message : 'ステータスの取得に失敗しました',
          variant: 'destructive',
        });
      }
    };

    // 処理中のステータスの場合のみチェックを開始
    if (jobId && ['processing', 'downloading', 'transcribing', 'generating'].includes(status)) {
      // 初回は即時実行
      checkJobStatus();
      // その後1秒ごとにチェック
      intervalId = setInterval(checkJobStatus, 1000);
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [jobId, status, progress, toast]);

  const handleJobStart = (newJobId: string) => {
    setStatus('processing');
    setProgress(0);
    setResult(null);

    // 少し待ってからジョブIDをセットしてポーリング開始
    setTimeout(() => {
      setJobId(newJobId);
    }, 100);

    toast({
      title: '処理開始',
      description: 'チャプターの生成を開始しました',
    });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />

      <main className="flex-1 container mx-auto px-4 py-8">
        {status === 'idle' && (
          <div className="flex flex-col gap-8">
            <InputForm onJobStart={handleJobStart} />
          </div>
        )}

        {status === 'done' && result && (
          <div className="flex flex-col gap-8">
            <InputForm onJobStart={handleJobStart} />
            <ResultsArea result={result} setResult={setResult} />
          </div>
        )}

        {status === 'error' && (
          <div className="flex flex-col gap-8">
            <InputForm onJobStart={handleJobStart} />
          </div>
        )}

        {['processing', 'downloading', 'transcribing', 'generating'].includes(status) && (
          <div className="h-full flex items-center justify-center">
            <ProgressModal status={status} progress={progress} />
          </div>
        )}
      </main>

      <footer className="py-6 border-t border-border">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>
            © 2025 YT-Chapter-Generator | プライバシーは保護されます -
            動画データは24時間後に自動削除されます
          </p>
        </div>
      </footer>
      <Toaster />
    </div>
  );
}
