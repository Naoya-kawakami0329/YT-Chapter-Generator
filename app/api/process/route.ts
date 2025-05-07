import { NextResponse } from 'next/server';
import { ProcessRequest, ProcessResponse } from '@/lib/types';
import YTDlpWrap from 'yt-dlp-wrap';
import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize yt-dlp
const ytDlp = new YTDlpWrap();

// Create temp directory if it doesn't exist
const tempDir = path.join(os.tmpdir(), 'yt-chapter-generator');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

export async function POST(request: Request) {
  try {
    const body: ProcessRequest = await request.json();
    const { url, language } = body;

    // Validate URL
    if (!url || !url.includes('youtube.com/') && !url.includes('youtu.be/')) {
      return NextResponse.json(
        { error: 'Invalid YouTube URL' },
        { status: 400 }
      );
    }

    // Generate a unique job ID
    const jobId = `job-${Math.random().toString(36).substring(2, 11)}`;
    const outputPath = path.join(tempDir, `${jobId}.mp3`);

    // Start the download process
    const downloadPromise = ytDlp.exec([
      url,
      '-x', // Extract audio
      '--audio-format', 'mp3',
      '--audio-quality', '0', // Best quality
      '-o', outputPath,
    ]);

    // Return initial response
    const response: ProcessResponse = {
      jobId,
      status: 'downloading',
    };

    // Start processing in the background
    processVideo(jobId, url, outputPath, language).catch(console.error);

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error processing request:', error);
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
}

async function processVideo(jobId: string, url: string, audioPath: string, language: string) {
  try {
    // Wait for download to complete
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Update status to transcribing
    // In a real implementation, this would be stored in a database
    console.log(`Job ${jobId}: Starting transcription`);

    // Read the audio file
    const audioFile = fs.createReadStream(audioPath);

    // Transcribe with Whisper
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-1",
      language: language === 'auto' ? undefined : language,
    });

    // Generate chapters based on transcription
    // This is a simplified version - in a real implementation,
    // you would use a more sophisticated algorithm to detect chapter boundaries
    const chapters = generateChapters(transcription.text);

    // Clean up the temporary file
    fs.unlinkSync(audioPath);

    // Store the result
    // In a real implementation, this would be stored in a database
    console.log(`Job ${jobId}: Processing complete`, chapters);

  } catch (error) {
    console.error(`Error processing job ${jobId}:`, error);
    // In a real implementation, update the job status to 'error'
  }
}

function generateChapters(text: string): string {
  // This is a simplified version - in a real implementation,
  // you would use a more sophisticated algorithm to detect chapter boundaries
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const chapters: string[] = [];
  let currentTime = 0;

  for (let i = 0; i < sentences.length; i += 5) {
    const chapterText = sentences.slice(i, i + 5).join('. ').trim();
    if (chapterText) {
      const minutes = Math.floor(currentTime / 60);
      const seconds = currentTime % 60;
      chapters.push(`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')} ${chapterText}`);
      currentTime += 30; // Assume each chapter is 30 seconds
    }
  }

  return chapters.join('\n');
}