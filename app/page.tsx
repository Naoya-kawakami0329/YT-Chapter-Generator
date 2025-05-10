"use client";

import { useState } from 'react';
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
  const [result, setResult] = useState<string>('');
  const [jobId, setJobId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const checkJobStatus = async (jobId: string) => {
    try {
      console.log('ジョブステータスを確認中:', jobId);
      const response = await fetch(`/api/status/${jobId}`);
      const data = await response.json();
      
      console.log('ステータスレスポンス:', {
        status: response.status,
        ok: response.ok,
        data
      });

      if (!response.ok) {
        throw new Error(data.error || 'ステータスの取得に失敗しました');
      }

      setStatus(data.status);
      setProgress(data.progress || 0);

      if (data.status === 'done' && data.result) {
        setResult(data.result);
        setError(null);
      } else if (data.status === 'error' && data.error) {
        setError(data.error);
      } else if (['downloading', 'transcribing', 'generating'].includes(data.status)) {
        // 処理中の場合は再度チェック
        setTimeout(() => checkJobStatus(jobId), 2000);
      }
    } catch (error) {
      console.error('ステータスチェック中にエラー:', error);
      setError(error instanceof Error ? error.message : 'ステータスの確認中にエラーが発生しました');
    }
  };

  const handleSubmit = async (url: string, language: string) => {
    try {
      setStatus('waiting');
      setProgress(0);
      setResult('');

      const response = await fetch('/api/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url, language }),
      });

      // デバッグ用：レスポンスの詳細をログ出力
      console.log('Response headers:', Object.fromEntries(response.headers.entries()));
      const responseText = await response.text();
      console.log('Response body:', responseText);

      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error('JSON parse error:', parseError);
        throw new Error('サーバーからの応答の解析に失敗しました');
      }
      
      if (!response.ok) {
        throw new Error(data.error || 'リクエストの処理に失敗しました');
      }

      if (!data.jobId) {
        throw new Error('ジョブIDが返されませんでした');
      }

      setJobId(data.jobId);
      
      // Start polling for job status
      checkJobStatus(data.jobId);
    } catch (error) {
      console.error('Error submitting request:', error);
      setStatus('error');
      toast({
        title: "エラーが発生しました",
        description: error instanceof Error ? error.message : "リクエストの処理に失敗しました",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      
      <main className="flex-1 container mx-auto px-4 py-8">
        {(status === 'idle' || status === 'done' || status === 'error') && (
          <div className="flex flex-col gap-8">
            <InputForm onSubmit={handleSubmit} />
            
            {status === 'done' && result && (
              <ResultsArea result={result} setResult={setResult} />
            )}
          </div>
        )}
        
        {status !== 'idle' && status !== 'done' && status !== 'error' && (
          <div className="h-full flex items-center justify-center">
            <ProgressModal status={status} progress={progress} />
          </div>
        )}
      </main>
      
      <footer className="py-6 border-t border-border">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>© 2025 YT-Chapter-Generator | プライバシーは保護されます - 動画データは24時間後に自動削除されます</p>
        </div>
      </footer>
      <Toaster />
    </div>
  );
}