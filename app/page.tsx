"use client";

import { useState } from 'react';
import { Toaster } from '@/components/ui/toaster';
import Header from '@/components/Header';
import InputForm from '@/components/InputForm';
import ProgressModal from '@/components/ProgressModal';
import ResultsArea from '@/components/ResultsArea';
import { ProcessStatus } from '@/lib/types';

export default function Home() {
  const [status, setStatus] = useState<ProcessStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<string>('');
  const [jobId, setJobId] = useState<string>('');

  const handleSubmit = async (url: string, language: string) => {
    // Mock processing flow
    setStatus('waiting');
    setProgress(0);
    setJobId(`mock-${Date.now()}`);
    
    // Simulate different stages with delays
    await new Promise(resolve => setTimeout(resolve, 1500));
    setStatus('downloading');
    setProgress(10);
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    setStatus('transcribing');
    setProgress(30);
    
    // Simulate transcription progress
    let currentProgress = 30;
    const intervalId = setInterval(() => {
      currentProgress += 5;
      setProgress(currentProgress);
      if (currentProgress >= 80) {
        clearInterval(intervalId);
      }
    }, 1000);
    
    await new Promise(resolve => setTimeout(resolve, 6000));
    setStatus('generating');
    setProgress(80);
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    setStatus('done');
    setProgress(100);
    
    // Mock result
    setResult(`00:00 イントロダクション
01:23 主要トピックの紹介
03:45 最初の議論ポイント
07:12 重要な分析と洞察
12:34 事例紹介
15:10 技術的な詳細の説明
18:45 課題と解決策
23:30 質疑応答セッション
28:15 今後の展望について
32:40 まとめと結論`);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      
      <main className="flex-1 container mx-auto px-4 py-8">
        {(status === 'idle' || status === 'done') && (
          <div className="flex flex-col gap-8">
            <InputForm onSubmit={handleSubmit} />
            
            {status === 'done' && (
              <ResultsArea result={result} setResult={setResult} />
            )}
          </div>
        )}
        
        {status !== 'idle' && status !== 'done' && (
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