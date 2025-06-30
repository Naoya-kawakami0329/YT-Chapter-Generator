'use client';

import { useState, useTransition } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { InfoIcon } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { processVideoAction } from '@/app/actions/video-actions';

interface InputFormProps {
  onJobStart: (jobId: string) => void;
}

export default function InputForm({ onJobStart }: InputFormProps) {
  const [language, setLanguage] = useState('ja');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string>('');

  const handleSubmit = async (formData: FormData) => {
    setError('');
    startTransition(async () => {
      const result = await processVideoAction(null, formData);
      if (result.success && result.jobId) {
        onJobStart(result.jobId);
      } else {
        setError(result.error || '処理に失敗しました');
      }
    });
  };

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="bg-card rounded-lg shadow-lg overflow-hidden transform transition-all hover:shadow-xl">
        <div className="p-6 md:p-8">
          <h2 className="text-2xl font-bold text-center mb-6">YouTube チャプター生成</h2>

          <form action={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="youtube-url">YouTube URL</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <InfoIcon className="h-4 w-4 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">
                        限定公開のURLも対応しています。最長2時間までの動画に対応しています。
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Input
                id="youtube-url"
                name="url"
                placeholder="https://www.youtube.com/watch?v=..."
                className="bg-background"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="language">言語</Label>
              <input type="hidden" name="language" value={language} />
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger id="language" className="bg-background">
                  <SelectValue placeholder="言語を選択" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ja">日本語</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="auto">自動検出</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {error && (
              <div className="text-red-600 text-sm">
                {error}
              </div>
            )}

            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 transition-all"
              disabled={isPending}
            >
              {isPending ? 'Processing...' : 'チャプターを生成'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
