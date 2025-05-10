'use client';

import { useState } from 'react';
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

interface InputFormProps {
  onSubmit: (url: string, language: string) => void;
}

export default function InputForm({ onSubmit }: InputFormProps) {
  const [url, setUrl] = useState('');
  const [language, setLanguage] = useState('ja');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (url) {
        await onSubmit(url, language);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="bg-card rounded-lg shadow-lg overflow-hidden transform transition-all hover:shadow-xl">
        <div className="p-6 md:p-8">
          <h2 className="text-2xl font-bold text-center mb-6">YouTube チャプター生成</h2>

          <form onSubmit={handleSubmit} className="space-y-6">
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
                placeholder="https://www.youtube.com/watch?v=..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="bg-background"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="language">言語</Label>
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

            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 transition-all"
              disabled={isLoading || !url}
            >
              {isLoading ? 'Processing...' : 'チャプターを生成'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
