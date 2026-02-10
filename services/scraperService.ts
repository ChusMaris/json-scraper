import { BASE_URL } from '../types';
import JSZip from 'jszip';

export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Downloads a ZIP file containing multiple JSONs.
 * This prevents browser "Multiple File Download" blocking.
 */
export const downloadAsZip = async (
  files: { filename: string; data: any }[], 
  zipFilename: string
): Promise<boolean> => {
  try {
    const zip = new JSZip();

    files.forEach(file => {
      zip.file(file.filename, JSON.stringify(file.data, null, 2));
    });

    const content = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(content);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = zipFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    return true;
  } catch (e) {
    console.error("ZIP Generation failed", e);
    return false;
  }
};

/**
 * Downloads a JSON object as a file in the browser (Legacy/Fallback).
 */
export const downloadJson = (data: any, filename: string) => {
  try {
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return true;
  } catch (e) {
    console.error("Download failed", e);
    return false;
  }
};

/**
 * PROXY STRATEGY:
 * We rotate through multiple providers to ensure we get the data.
 * REORDERED: Moved 'corsproxy.io' to the bottom as it is frequently blocked by IT filters.
 */
const PROXY_PROVIDERS = [
  {
    name: 'allorigins-wrapped',
    // Using /get to avoid some CORS header issues, returns JSON wrapper
    getUrl: (target: string) => `https://api.allorigins.win/get?url=${encodeURIComponent(target)}`,
    isWrapped: true
  },
  {
    name: 'codetabs',
    // Another reliable proxy for dev use
    getUrl: (target: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(target)}`,
    isWrapped: false
  },
  {
    name: 'corsproxy.io',
    // Moved to last resort to avoid triggering IT Firewall alerts if possible
    getUrl: (target: string) => `https://corsproxy.io/?${encodeURIComponent(target)}`,
    isWrapped: false
  }
];

/**
 * Fetches text content (HTML or JSON string) using the proxy fallback strategy.
 */
async function fetchTextWithFallback(targetUrl: string): Promise<string> {
  const urlWithCacheBuster = `${targetUrl}${targetUrl.includes('?') ? '&' : '?'}__t=${Date.now()}`;
  
  let lastError: any = null;

  for (const provider of PROXY_PROVIDERS) {
    try {
      const proxyUrl = provider.getUrl(urlWithCacheBuster);
      console.log(`Attempting fetch via ${provider.name}...`);
      
      const response = await fetch(proxyUrl);
      
      if (!response.ok) {
        throw new Error(`Proxy ${provider.name} returned status ${response.status}`);
      }
      
      let text = '';

      if (provider.isWrapped) {
        // Handle AllOrigins wrapped response
        const wrapperJson = await response.json();
        if (wrapperJson && wrapperJson.status && wrapperJson.status.http_code === 200) {
           text = wrapperJson.contents;
        } else {
           throw new Error(`Wrapped proxy returned error code: ${wrapperJson?.status?.http_code}`);
        }
      } else {
        // Standard raw proxy
        text = await response.text();
      }
      
      if (!text || text.trim().length === 0) {
        throw new Error("Received empty response body");
      }

      return text;
    } catch (error) {
      console.warn(`Failed with ${provider.name}:`, error);
      lastError = error;
      // Wait before trying the next one
      await delay(1000);
    }
  }

  throw lastError || new Error("All proxies failed to retrieve data.");
}

/**
 * Fetches the HTML of the main results list page to find match links.
 */
export const fetchResultsPage = async (pageUrl: string): Promise<string[]> => {
  try {
    const html = await fetchTextWithFallback(pageUrl);
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Find all links containing '/estadistiques/'
    const anchors = Array.from(doc.querySelectorAll('a'));
    const statsLinks = anchors
      .map(a => a.getAttribute('href'))
      .filter((href): href is string => href !== null && href.includes('/estadistiques/'))
      // Normalize URLs (some might be relative)
      .map(href => href.startsWith('http') ? href : `${BASE_URL}${href.startsWith('/') ? '' : '/'}${href}`);

    // Deduplicate
    return Array.from(new Set(statsLinks));
  } catch (error) {
    console.error("Error scraping results page:", error);
    throw error;
  }
};

/**
 * Fetches the specific JSON data for a match using the API.
 */
export const fetchMatchData = async (matchId: string, type: 'stats' | 'moves'): Promise<any> => {
  const API_BASE = "https://msstats.optimalwayconsulting.com/v1/fcbq";
  const endpoint = type === 'stats' ? 'getJsonWithMatchStats' : 'getJsonWithMatchMoves';
  
  const targetUrl = `${API_BASE}/${endpoint}/${matchId}?currentSeason=true`;
  
  try {
    const jsonString = await fetchTextWithFallback(targetUrl);
    
    try {
      return JSON.parse(jsonString);
    } catch (e) {
      console.error(`Failed to parse JSON for ${type}.`, e);
      throw new Error("Invalid JSON response from server");
    }
  } catch (error) {
    console.error(`Error fetching ${type} for ${matchId}:`, error);
    throw error;
  }
};