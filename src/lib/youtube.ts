export interface YouTubeVideo {
  videoId: string;
  title: string;
  embedUrl: string;
  embedHtml: string;
}

export async function searchYouTubeVideos(
  query: string,
  maxResults: number = 1
): Promise<YouTubeVideo[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;

  if (apiKey) {
    // Use YouTube Data API v3
    const params = new URLSearchParams({
      part: "snippet",
      q: query,
      type: "video",
      maxResults: String(maxResults),
      key: apiKey,
      relevanceLanguage: "nl",
    });

    const response = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
    if (response.ok) {
      const data = await response.json();
      return (data.items || []).map((item: any) => ({
        videoId: item.id.videoId,
        title: item.snippet.title,
        embedUrl: `https://www.youtube.com/embed/${item.id.videoId}`,
        embedHtml: buildEmbedHtml(item.id.videoId, item.snippet.title),
      }));
    }
  }

  // Fallback: construct a search-based embed
  // Use a common/popular video approach - just return a search link
  const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
  return [{
    videoId: "",
    title: query,
    embedUrl: searchUrl,
    embedHtml: `<p><a href="${searchUrl}" target="_blank" rel="noopener noreferrer">Bekijk relevante video's over: ${query}</a></p>`,
  }];
}

function buildEmbedHtml(videoId: string, title: string): string {
  return `<figure class="video-embed"><div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;max-width:100%;"><iframe src="https://www.youtube.com/embed/${videoId}" title="${title}" style="position:absolute;top:0;left:0;width:100%;height:100%;" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div></figure>`;
}
