'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { CopyIcon, DownloadIcon, CheckIcon, PencilIcon, SaveIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ResultsAreaProps {
  result: string;
  setResult: (result: string) => void;
}

export default function ResultsArea({ result, setResult }: ResultsAreaProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      toast({
        title: 'コピーしました',
        description: 'チャプターがクリップボードにコピーされました。',
      });

      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast({
        title: 'エラー',
        description: 'コピーに失敗しました。もう一度お試しください。',
        variant: 'destructive',
      });
    }
  };

  const handleDownload = () => {
    const blob = new Blob([result], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `youtube-chapters-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: 'ダウンロードしました',
      description: 'チャプターファイルがダウンロードされました。',
    });
  };

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleSave = () => {
    setIsEditing(false);
    toast({
      title: '保存しました',
      description: 'チャプターの編集が保存されました。',
    });
  };

  return (
    <div className="bg-card rounded-lg shadow-lg overflow-hidden border border-border">
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold">生成されたチャプター</h3>
          <div className="flex gap-2">
            {isEditing ? (
              <Button variant="outline" size="sm" onClick={handleSave}>
                <SaveIcon className="h-4 w-4 mr-2" />
                保存
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={handleEdit}>
                <PencilIcon className="h-4 w-4 mr-2" />
                編集
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handleDownload}>
              <DownloadIcon className="h-4 w-4 mr-2" />
              ダウンロード
            </Button>
            <Button variant="default" size="sm" onClick={handleCopy}>
              {copied ? (
                <CheckIcon className="h-4 w-4 mr-2" />
              ) : (
                <CopyIcon className="h-4 w-4 mr-2" />
              )}
              {copied ? 'コピーしました' : 'コピー'}
            </Button>
          </div>
        </div>

        <Textarea
          value={result}
          onChange={(e) => setResult(e.target.value)}
          className="min-h-[300px] font-mono resize-y"
          placeholder="チャプターが生成されるとここに表示されます..."
          readOnly={!isEditing}
        />

        <p className="mt-4 text-sm text-muted-foreground">
          <span className="font-semibold">形式:</span> MM:SS チャプタータイトル
        </p>
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold">注意:</span>{' '}
          YouTubeの規定により、各チャプターは最低10秒以上、3章以上必要です。
        </p>
      </div>
    </div>
  );
}
