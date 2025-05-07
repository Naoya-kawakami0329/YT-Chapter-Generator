"use client";

import { useState, useCallback } from 'react';
import { UploadCloudIcon, FileIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FileDropZoneProps {
  onFileDrop: (file: File) => void;
  file: File | null;
}

export default function FileDropZone({ onFileDrop, file }: FileDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const droppedFile = files[0];
      // Check if file is audio or video
      if (droppedFile.type.startsWith('audio/') || droppedFile.type.startsWith('video/')) {
        onFileDrop(droppedFile);
      }
    }
  }, [onFileDrop]);

  return (
    <div
      className={cn(
        "border-2 border-dashed rounded-lg p-8 text-center transition-all duration-200",
        isDragging ? "bg-primary/5 border-primary" : "border-border",
        file ? "bg-primary/5" : ""
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {file ? (
        <div className="flex flex-col items-center gap-2">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <FileIcon className="h-6 w-6 text-primary" />
          </div>
          <p className="font-medium">{file.name}</p>
          <p className="text-sm text-muted-foreground">
            {(file.size / (1024 * 1024)).toFixed(2)} MB
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center animate-pulse">
            <UploadCloudIcon className="h-6 w-6 text-primary" />
          </div>
          <p className="font-medium">ドラッグ＆ドロップでファイルをアップロード</p>
          <p className="text-sm text-muted-foreground">
            MP3, MP4, WAV, M4A (最大 2時間)
          </p>
        </div>
      )}
    </div>
  );
}