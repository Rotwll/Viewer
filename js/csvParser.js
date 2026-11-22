/**
 * Arctic Shift Parser - Handles JSON Lines format from Reddit exports
 */
class CSVParser {
    /**
     * Check if text is in JSON Lines format
     */
    static isJSONL(text) {
        if (!text) return false;
        const lines = text.split('\n').filter(line => line.trim() !== '');
        if (lines.length === 0) return false;
        
        // Check first few lines for valid JSON
        const checkLines = Math.min(lines.length, 5);
        let validCount = 0;
        
        for (let i = 0; i < checkLines; i++) {
            try {
                JSON.parse(lines[i]);
                validCount++;
            } catch (e) {
                // Not valid JSON
            }
        }
        
        // If more than 50% of lines are valid JSON, it's likely JSONL
        return validCount / checkLines > 0.5;
    }
    
    /**
     * Parse Arctic Shift data (JSON Lines format)
     * Each line is a JSON object containing Reddit post/comment data
     */
    static parse(text, options = {}) {
        // First, check if it's JSONL format
        if (this.isJSONL(text)) {
            const lines = text.split('\n').filter(line => line.trim() !== '');
            const results = [];
            
            for (const line of lines) {
                try {
                    const obj = JSON.parse(line);
                    if (this.isRedditItem(obj)) {
                        const normalized = this.normalizeItem(obj);
                        results.push(normalized);
                    }
                } catch (e) {
                    // Skip invalid JSON lines
                }
            }
            
            if (results.length > 0) {
                return results;
            }
        }
        
        // Try parsing as single JSON array
        try {
            const jsonData = JSON.parse(text);
            if (Array.isArray(jsonData)) {
                const results = [];
                for (const obj of jsonData) {
                    if (this.isRedditItem(obj)) {
                        results.push(this.normalizeItem(obj));
                    }
                }
                if (results.length > 0) {
                    return results;
                }
            }
        } catch (e) {
            // Not a single JSON array
        }
        
        // Fallback: try CSV parsing
        return this.parseCSV(text);
    }
    
    /**
     * Check if object is a Reddit post or comment
     */
    static isRedditItem(obj) {
        // Check for common Reddit fields
        const hasRedditFields = obj.id && 
            (obj.subreddit || obj.subreddit_id) && 
            (obj.title !== undefined || obj.selftext !== undefined || obj.body !== undefined);
        
        // Check for Arctic Shift meta
        const hasArcticMeta = obj._meta && obj._meta.retrieved_2nd_on;
        
        return hasRedditFields || hasArcticMeta;
    }
    
    /**
     * Normalize Reddit item to standard format
     */
    static normalizeItem(item) {
        // Determine if it's a post or comment
        const type = this.detectType(item);
        
        // Extract fields
        const normalized = {
            Type: type,
            'Date & Time (UTC)': this.formatDate(item.created_utc || item.created),
            Subreddit: this.cleanSubreddit(item.subreddit || item.subreddit_name_prefixed),
            Title: this.extractTitle(item),
            Content: this.extractContent(item),
            'Media Links': this.extractMediaLinks(item),
            Score: String(item.score || item.ups || item.downs || 0),
            ID: item.id || item.name || '',
            // Additional Reddit-specific fields
            Author: item.author || '',
            Permalink: item.permalink || '',
            URL: item.url || item.url_overridden_by_dest || '',
            Domain: item.domain || '',
            Flair: this.extractFlair(item),
            IsSelf: item.is_self || false,
            IsVideo: item.is_video || false,
            IsGallery: !!item.gallery_data,
            NumComments: item.num_comments || 0,
            UpvoteRatio: item.upvote_ratio || 0,
            // Raw data for debugging
            _raw: item
        };
        
        // Extract media from various sources
        normalized._mediaUrls = this.extractAllMedia(item);
        
        return normalized;
    }
    
    /**
     * Detect if item is a Post or Comment
     */
    static detectType(item) {
        // Check if it's a comment (has body/body_html)
        if (item.body !== undefined || item.body_html !== undefined) {
            return 'Comment';
        }
        // Check if it's a post (has selftext, title, etc.)
        if (item.selftext !== undefined || item.title !== undefined || item.url !== undefined) {
            return 'Post';
        }
        // Check if it has both (unlikely)
        if (item.body && item.title) {
            return 'Post'; // Default to Post
        }
        return 'Post';
    }
    
    /**
     * Format Unix timestamp to readable date
     */
    static formatDate(timestamp) {
        if (!timestamp) return 'Unknown';
        const date = new Date(timestamp * 1000);
        if (isNaN(date.getTime())) return 'Unknown';
        return date.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
    }
    
    /**
     * Clean subreddit name (remove r/ prefix)
     */
    static cleanSubreddit(subreddit) {
        if (!subreddit) return 'unknown';
        return String(subreddit).replace(/^r\//, '');
    }
    
    /**
     * Extract title from item
     */
    static extractTitle(item) {
        // For posts
        if (item.title) return String(item.title);
        // For comments, use a truncated version of body
        if (item.body) {
            const body = String(item.body);
            if (body.length > 60) {
                return body.substring(0, 60) + '...';
            }
            return body;
        }
        return '';
    }
    
    /**
     * Extract content from item
     */
    static extractContent(item) {
        // For posts
        if (item.selftext && item.selftext !== '[removed]' && item.selftext !== '') {
            return String(item.selftext);
        }
        // For comments
        if (item.body && item.body !== '[removed]') {
            return String(item.body);
        }
        // Fallback
        if (item.selftext_html || item.body_html) {
            // Strip HTML tags for cleaner display
            const html = item.selftext_html || item.body_html;
            return this.stripHtml(html);
        }
        return '';
    }
    
    /**
     * Extract flair text
     */
    static extractFlair(item) {
        if (item.link_flair_text) return String(item.link_flair_text);
        if (item.author_flair_text) return String(item.author_flair_text);
        return '';
    }
    
    /**
     * Extract media links from item
     */
    static extractMediaLinks(item) {
        const links = [];
        
        // Direct URL
        if (item.url) links.push(item.url);
        if (item.url_overridden_by_dest) links.push(item.url_overridden_by_dest);
        
        // Gallery images
        if (item.gallery_data && item.media_metadata) {
            for (const [key, media] of Object.entries(item.media_metadata)) {
                if (media.s && media.s.u) {
                    links.push(media.s.u);
                }
            }
        }
        
        // Preview images
        if (item.preview && item.preview.images) {
            for (const image of item.preview.images) {
                if (image.source && image.source.url) {
                    links.push(image.source.url);
                }
            }
        }
        
        // Media embed
        if (item.media && item.media.reddit_video && item.media.reddit_video.fallback_url) {
            links.push(item.media.reddit_video.fallback_url);
        }
        
        // Media links field (if present)
        if (item['Media Links']) {
            const mediaLinks = String(item['Media Links']);
            const urls = mediaLinks.match(/https?:\/\/[^\s,"']+/g);
            if (urls) links.push(...urls);
        }
        
        // Thumbnail
        if (item.thumbnail && item.thumbnail.startsWith('http')) {
            links.push(item.thumbnail);
        }
        
        return links.join(' ');
    }
    
    /**
     * Extract ALL media including external links
     */
    static extractAllMedia(item) {
        const media = {
            images: [],
            videos: [],
            externalLinks: [],
            gallery: [],
            redditMedia: []
        };
        
        // Helper to add URL
        const addUrl = (url, type) => {
            if (!url || url === 'self' || url === 'default') return;
            if (this.isImageUrl(url)) {
                media.images.push(url);
            } else if (this.isVideoUrl(url)) {
                media.videos.push(url);
            } else if (url.includes('reddit.com') || url.includes('redd.it')) {
                media.redditMedia.push(url);
            } else {
                media.externalLinks.push(url);
            }
        };
        
        // Check various fields
        if (item.url) addUrl(item.url, 'url');
        if (item.url_overridden_by_dest) addUrl(item.url_overridden_by_dest, 'dest');
        
        // Gallery
        if (item.gallery_data && item.media_metadata) {
            for (const [key, mediaObj] of Object.entries(item.media_metadata)) {
                if (mediaObj.s && mediaObj.s.u) {
                    media.gallery.push(mediaObj.s.u);
                }
            }
        }
        
        // Preview images
        if (item.preview && item.preview.images) {
            for (const image of item.preview.images) {
                if (image.source && image.source.url) {
                    media.images.push(image.source.url);
                }
            }
        }
        
        // Video
        if (item.media && item.media.reddit_video && item.media.reddit_video.fallback_url) {
            media.videos.push(item.media.reddit_video.fallback_url);
        }
        
        // Video from v.redd.it
        if (item.url && item.url.includes('v.redd.it')) {
            media.videos.push(item.url);
        }
        
        // Thumbnail
        if (item.thumbnail && item.thumbnail.startsWith('http')) {
            media.images.push(item.thumbnail);
        }
        
        return media;
    }
    
    /**
     * Check if URL is an image
     */
    static isImageUrl(url) {
        if (!url) return false;
        const imageExtensions = /\.(jpg|jpeg|png|gif|webp|bmp|svg|avif|ico)(\?.*)?$/i;
        return imageExtensions.test(url) || 
               url.includes('i.redd.it') || 
               url.includes('i.imgur.com');
    }
    
    /**
     * Check if URL is a video
     */
    static isVideoUrl(url) {
        if (!url) return false;
        const videoExtensions = /\.(mp4|webm|mov|avi)(\?.*)?$/i;
        return videoExtensions.test(url) || 
               url.includes('v.redd.it') || 
               url.includes('youtube.com') || 
               url.includes('youtu.be');
    }
    
    /**
     * Strip HTML tags
     */
    static stripHtml(html) {
        if (!html) return '';
        const div = document.createElement('div');
        div.innerHTML = html;
        return div.textContent || div.innerText || '';
    }
    
    /**
     * Parse CSV format (fallback for older exports)
     */
    static parseCSV(text) {
        // Parse CSV rows
        const rows = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            if (char === '"') {
                inQuotes = !inQuotes;
                current += char;
            } else if (char === '\n' && !inQuotes) {
                rows.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        if (current) rows.push(current);
        
        if (rows.length === 0) return [];
        
        // Parse headers
        const headers = rows[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        const result = [];
        
        for (let i = 1; i < rows.length; i++) {
            const values = this.parseCSVRow(rows[i]);
            if (values.length === 0) continue;
            
            const obj = {};
            headers.forEach((h, idx) => {
                obj[h] = values[idx] || '';
            });
            result.push(this.normalizeItem(obj));
        }
        
        return result;
    }
    
    /**
     * Parse CSV row handling quotes
     */
    static parseCSVRow(row) {
        const values = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < row.length; i++) {
            const char = row[i];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                values.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        values.push(current.trim());
        return values;
    }
}