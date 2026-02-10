import React, { useState, useCallback } from 'react';
import { MatchJob, ScrapeStatus, extractMatchId } from './types';
import { fetchResultsPage, fetchMatchData, downloadAsZip, delay } from './services/scraperService';
import JobCard from './components/JobCard';
import { PlayIcon, DownloadIcon, Spinner } from './components/Icon';

const DEFAULT_SINGLE_URL = "https://www.basquetcatala.cat/estadistiques/2025/696b6acdd2a7ac0001714803";
const DEFAULT_LIST_URL = "https://www.basquetcatala.cat/competicions/resultats/21639/0";

const App: React.FC = () => {
  const [mode, setMode] = useState<'single' | 'bulk'>('single');
  const [inputUrl, setInputUrl] = useState(DEFAULT_SINGLE_URL);
  const [customFilename, setCustomFilename] = useState("");
  const [jobs, setJobs] = useState<MatchJob[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>("");

  // Process a single job and return the data, handling UI updates
  const processJob = useCallback(async (job: MatchJob): Promise<{ stats: any, moves: any } | null> => {
    // Update status to processing
    setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: ScrapeStatus.DOWNLOADING_JSON } : j));

    try {
      // 1. Fetch Stats in memory
      const statsData = await fetchMatchData(job.id, 'stats');
      
      // Update UI to show progress (halfway there)
      setJobs(prev => prev.map(j => j.id === job.id ? { ...j, statsFileDownloaded: true } : j));
      
      // Small delay to be gentle with API
      await delay(500);

      // 2. Fetch Moves in memory
      const movesData = await fetchMatchData(job.id, 'moves');

      // Update UI
      setJobs(prev => prev.map(j => j.id === job.id ? { 
        ...j, 
        movesFileDownloaded: true,
        status: ScrapeStatus.COMPLETED 
      } : j));

      return { stats: statsData, moves: movesData };

    } catch (error) {
      console.error(error);
      setJobs(prev => prev.map(j => j.id === job.id ? { 
        ...j, 
        status: ScrapeStatus.ERROR,
        error: error instanceof Error ? error.message : "Unknown error" 
      } : j));
      return null;
    }
  }, []);

  // Determine final zip name based on input or defaults
  const getZipName = (defaultName: string) => {
    let name = customFilename.trim();
    if (!name) return defaultName;
    if (!name.toLowerCase().endsWith('.zip')) {
      name += '.zip';
    }
    return name;
  };

  /**
   * Extracts metadata from the stats JSON to generate the requested filename format.
   * Format: Jx_Py_pl_pv.json
   */
  const generateFilenames = (stats: any, index: number) => {
    let jornada = '0';
    let pl = '0';
    let pv = '0';

    if (stats) {
      // Try to find Jornada
      // Usually in root 'jornada' or 'match.jornada'
      if (stats.jornada) jornada = String(stats.jornada);
      else if (stats.match && stats.match.jornada) jornada = String(stats.match.jornada);
      
      // Try to find Local Points (Prioritize user structure: teams[0].data.score)
      if (stats.teams && stats.teams[0]?.data?.score !== undefined) {
        pl = String(stats.teams[0].data.score);
      } else if (stats.resultatLocal !== undefined) {
        pl = String(stats.resultatLocal);
      } else if (stats.match && stats.match.resultatLocal !== undefined) {
        pl = String(stats.match.resultatLocal);
      }

      // Try to find Visitor Points (Prioritize user structure: teams[1].data.score)
      if (stats.teams && stats.teams[1]?.data?.score !== undefined) {
        pv = String(stats.teams[1].data.score);
      } else if (stats.resultatVisitant !== undefined) {
        pv = String(stats.resultatVisitant);
      } else if (stats.match && stats.match.resultatVisitant !== undefined) {
        pv = String(stats.match.resultatVisitant);
      }
    }

    // Clean strings (remove spaces if any)
    const x = jornada.trim();
    const y = index;
    const pl_clean = pl.trim();
    const pv_clean = pv.trim();

    return {
      statsName: `J${x}_P${y}_${pl_clean}_${pv_clean}.json`,
      movesName: `J${x}_P${y}_Moves.json`
    };
  };

  // Handle Single URL Start
  const handleSingleStart = async () => {
    const id = extractMatchId(inputUrl);
    if (!id) {
      setStatusMessage("Invalid URL. Could not extract Match ID.");
      return;
    }

    setIsProcessing(true);
    setStatusMessage("Starting download...");
    
    const newJob: MatchJob = {
      id,
      url: inputUrl,
      status: ScrapeStatus.QUEUED,
      statsFileDownloaded: false,
      movesFileDownloaded: false,
      matchTitle: "Single Match Extraction"
    };

    setJobs([newJob]);
    
    const result = await processJob(newJob);
    
    if (result) {
      const defaultName = `match_${id}.zip`;
      const zipFilename = getZipName(defaultName);

      // Generate formatted names. Index is 1 for single match.
      const { statsName, movesName } = generateFilenames(result.stats, 1);

      const files = [
        { filename: statsName, data: result.stats },
        { filename: movesName, data: result.moves }
      ];
      
      await downloadAsZip(files, zipFilename);
    }
    
    setIsProcessing(false);
    setStatusMessage("Finished.");
  };

  // Handle Bulk Start
  const handleBulkStart = async () => {
    setIsProcessing(true);
    setJobs([]);
    setStatusMessage("Fetching result list page...");

    try {
      // 1. Fetch the list of URLs
      const links = await fetchResultsPage(inputUrl);
      
      if (links.length === 0) {
        setStatusMessage("No statistics links found on that page.");
        setIsProcessing(false);
        return;
      }

      setStatusMessage(`Found ${links.length} matches. queuing...`);

      // 2. Create Jobs
      const initialJobs: MatchJob[] = links.map(url => {
        const id = extractMatchId(url);
        return {
          id: id || 'unknown',
          url,
          status: ScrapeStatus.IDLE,
          statsFileDownloaded: false,
          movesFileDownloaded: false,
          matchTitle: `Match ${id}`
        };
      }).filter(j => j.id !== 'unknown');

      setJobs(initialJobs);

      // Store all files here to zip them at the end
      const allFiles: { filename: string; data: any }[] = [];

      // 3. Process Queue (Sequential)
      for (let i = 0; i < initialJobs.length; i++) {
        const job = initialJobs[i];
        
        // Update to queued visually
        setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: ScrapeStatus.QUEUED } : j));
        
        setStatusMessage(`Processing ${i + 1} of ${initialJobs.length}...`);
        
        const result = await processJob(job);

        if (result) {
          // Generate formatted names based on scraped data
          // i + 1 is the match index (y)
          const { statsName, movesName } = generateFilenames(result.stats, i + 1);

          // Request: Stats in root, Moves in 'Moves/' folder
          allFiles.push({ filename: statsName, data: result.stats });
          allFiles.push({ filename: `Moves/${movesName}`, data: result.moves });
        }
        
        // Delay between matches
        await delay(1500); 
      }

      // 4. Generate SINGLE ZIP for all matches
      if (allFiles.length > 0) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const defaultName = `bulk_matches_export_${timestamp}.zip`;
        const zipFilename = getZipName(defaultName);

        setStatusMessage(`Compressing ${allFiles.length} files into one ZIP...`);
        await downloadAsZip(allFiles, zipFilename);
        setStatusMessage("All jobs finished. ZIP downloaded.");
      } else {
        setStatusMessage("Finished, but no files were successfully retrieved.");
      }

    } catch (error) {
      console.error(error);
      setStatusMessage("Error fetching the list page. Check CORS or URL.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleStart = () => {
    if (mode === 'single') handleSingleStart();
    else handleBulkStart();
  };

  const switchMode = (newMode: 'single' | 'bulk') => {
    setMode(newMode);
    setInputUrl(newMode === 'single' ? DEFAULT_SINGLE_URL : DEFAULT_LIST_URL);
    setCustomFilename(""); // Clear filename on mode switch
  };

  return (
    <div className="min-h-screen p-4 sm:p-8 flex flex-col items-center">
      
      <header className="mb-8 text-center max-w-2xl">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-basketball-600 text-white mb-4 shadow-lg shadow-basketball-900/50">
          <DownloadIcon />
        </div>
        <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">BasquetCatala <span className="text-basketball-500">JSON Scraper</span></h1>
        <p className="text-slate-400">
          Downloads match data as <strong>ZIP files</strong> to avoid browser blocking.
          <br/>
          <span className="text-xs text-slate-500 uppercase tracking-widest font-bold mt-2 block">
            Powered by Multi-Proxy Routing
          </span>
        </p>
      </header>

      <main className="w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        
        {/* Tab Switcher */}
        <div className="flex border-b border-slate-800">
          <button 
            onClick={() => switchMode('single')}
            className={`flex-1 py-4 text-sm font-medium transition-colors ${mode === 'single' ? 'bg-slate-800 text-basketball-500' : 'text-slate-500 hover:text-slate-300'}`}
          >
            Single Match
          </button>
          <button 
            onClick={() => switchMode('bulk')}
            className={`flex-1 py-4 text-sm font-medium transition-colors ${mode === 'bulk' ? 'bg-slate-800 text-basketball-500' : 'text-slate-500 hover:text-slate-300'}`}
          >
            Bulk From Results Page
          </button>
        </div>

        {/* Controls */}
        <div className="p-6 bg-slate-800/50 space-y-4">
          
          {/* URL Input */}
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              Target URL
            </label>
            <input 
              type="text" 
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              disabled={isProcessing}
              className="w-full bg-slate-900 border border-slate-700 text-slate-200 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-basketball-500 disabled:opacity-50 font-mono text-sm"
            />
          </div>

          {/* Filename Input */}
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              Output Filename (Optional)
            </label>
            <input 
              type="text" 
              value={customFilename}
              onChange={(e) => setCustomFilename(e.target.value)}
              placeholder={mode === 'single' ? "e.g. match_day_1" : "e.g. full_league_export"}
              disabled={isProcessing}
              className="w-full bg-slate-900 border border-slate-700 text-slate-200 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-basketball-500 disabled:opacity-50 font-mono text-sm"
            />
            <p className="text-[10px] text-slate-500 mt-1">If left empty, a default name will be used.</p>
          </div>
          
          {/* Action Button */}
          <button 
            onClick={handleStart}
            disabled={isProcessing}
            className="w-full bg-basketball-600 hover:bg-basketball-500 text-white font-bold py-3 px-6 rounded-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-basketball-900/20"
          >
            {isProcessing ? <Spinner /> : <PlayIcon />}
            {isProcessing ? 'Working...' : 'Extract & Download'}
          </button>

          <div className="flex items-center justify-between pt-2 border-t border-slate-700/50">
             <p className="text-sm text-slate-400 font-mono">
                {statusMessage || "Ready to start."}
             </p>
             {mode === 'bulk' && jobs.length > 0 && (
                <span className="text-xs text-slate-500">
                  {jobs.filter(j => j.status === ScrapeStatus.COMPLETED).length} / {jobs.length} Completed
                </span>
             )}
          </div>
        </div>

        {/* Results List */}
        <div className="p-6 bg-slate-900 min-h-[250px] max-h-[500px] overflow-y-auto">
          {jobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-600 py-10">
              <div className="mb-4 p-4 rounded-full bg-slate-800/50">
                <DownloadIcon />
              </div>
              <p>No jobs queued.</p>
              <p className="text-sm mt-2">Enter a URL above and click Extract.</p>
            </div>
          ) : (
            <div className="space-y-2">
               {jobs.map(job => (
                 <JobCard key={job.id} job={job} />
               ))}
            </div>
          )}
        </div>

      </main>
      
      <footer className="mt-8 text-slate-600 text-sm">
        Generated by AI Senior Engineer • React 18 • TypeScript • Tailwind
      </footer>
    </div>
  );
};

export default App;