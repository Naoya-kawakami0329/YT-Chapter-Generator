import { NextResponse } from 'next/server';
import { JobStatus } from '@/lib/types';

export async function GET(
  request: Request,
  { params }: { params: { jobId: string } }
) {
  try {
    const jobId = params.jobId;
    
    // Mock implementation - would check real status in production
    // In a real implementation, this would:
    // 1. Check the status of the job in the queue
    // 2. Return real progress and status information
    
    // For now, just return a dummy response
    const mockStatus: JobStatus = {
      jobId,
      status: 'transcribing',
      progress: 45,
    };
    
    return NextResponse.json(mockStatus);
  } catch (error) {
    console.error('Error getting status:', error);
    return NextResponse.json(
      { error: 'Failed to get job status' },
      { status: 500 }
    );
  }
}