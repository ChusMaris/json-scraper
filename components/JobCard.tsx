import React from 'react';
import { MatchJob, ScrapeStatus } from '../types';
import { CheckCircleIcon, XCircleIcon, Spinner } from './Icon';

interface JobCardProps {
  job: MatchJob;
}

const JobCard: React.FC<JobCardProps> = ({ job }) => {
  const getStatusColor = (status: ScrapeStatus) => {
    switch (status) {
      case ScrapeStatus.COMPLETED: return 'bg-green-500/10 border-green-500/50 text-green-500';
      case ScrapeStatus.ERROR: return 'bg-red-500/10 border-red-500/50 text-red-500';
      case ScrapeStatus.DOWNLOADING_JSON:
      case ScrapeStatus.FETCHING_HTML: return 'bg-blue-500/10 border-blue-500/50 text-blue-500';
      case ScrapeStatus.QUEUED: return 'bg-slate-700/50 border-slate-600 text-slate-400';
      default: return 'bg-slate-800 border-slate-700 text-slate-400';
    }
  };

  const statusColorClass = getStatusColor(job.status);

  return (
    <div className={`flex items-center justify-between p-3 rounded-lg border mb-2 transition-all ${statusColorClass}`}>
      <div className="flex flex-col overflow-hidden">
        <span className="text-xs font-mono opacity-70 mb-1">ID: {job.id}</span>
        <a 
          href={job.url} 
          target="_blank" 
          rel="noopener noreferrer" 
          className="text-sm font-semibold hover:underline truncate"
          title={job.url}
        >
          {job.matchTitle || "Basketball Match Stats"}
        </a>
        <div className="flex gap-2 mt-1">
            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${job.statsFileDownloaded ? 'bg-green-500 text-white border-green-600' : 'bg-slate-800 text-slate-500 border-slate-600'}`}>
                STATS
            </span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${job.movesFileDownloaded ? 'bg-green-500 text-white border-green-600' : 'bg-slate-800 text-slate-500 border-slate-600'}`}>
                MOVES
            </span>
        </div>
      </div>
      
      <div className="ml-4 shrink-0">
        {job.status === ScrapeStatus.COMPLETED && <CheckCircleIcon className="w-6 h-6" />}
        {job.status === ScrapeStatus.ERROR && <XCircleIcon className="w-6 h-6" />}
        {(job.status === ScrapeStatus.DOWNLOADING_JSON || job.status === ScrapeStatus.FETCHING_HTML) && <Spinner className="w-6 h-6" />}
        {job.status === ScrapeStatus.QUEUED && <span className="text-xs font-bold px-2 py-1 rounded bg-slate-800">Q</span>}
      </div>
    </div>
  );
};

export default JobCard;
